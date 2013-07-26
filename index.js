
/**
 * Module dependencies
 */

var request = require('superagent')
  , topcoat = require('topcoat')
  , EventEmitter = require('events').EventEmitter
  , parseUrl = require('url').parse
  , debug = require('debug')
  , qs = require('querystring')
  , hash = require('hash')
  , domeready = require('domready')
  , sregex = require('sregex')
  , dot = require('doT')
  , wait = setTimeout
  , global = global || window



/**
 * Initializations
 */

// initialize hash
hash.init();


// initialize `dot` settings
dot.templateSettings.varname = 'view';


/**
 * Generates an sfap `app` object
 *
 * @api public
 * @param {String} `name`
 * @param {Object} `location`
 */

module.exports = sfap;
function sfap (name, location) {
	name = name || 'app-' + (Math.random().toString(16).slice(2));
	var app = initialize({
		name: name, 
		location: location || window.location || {}
	})

	return app;
}


/**
 * Initializes the `app` object
 *
 * @api private
 * @param {Object} `app`
 * @return {Object}
 */

function initialize (app) {
	// internal settings
	var settings = {}
	  , cache = {view: {}, module: {}}


	// bind topcoat to `.ui`
	app.ui = topcoat;


	// filter stack
	app.stack = [];

	
	// bind `dot.template` and attach to `app`
	app.template = function (str) {
		return dot.template(str);
	};


	// util object
	app.util = {
		request: request,
		parseUrl: parseUrl,
		debug: debug,
		qs: qs
	};

	
	// (#) Hash change event management object
	app.hash = {
		stack: [],
		on: hash.route.bind(hash),
		set: hash.update.bind(hash),
		use: function (fn) {
			if ('function' !== typeof fn) throw new TypeError("expecting `function`");
			else this.stack.push(fn);
			return this;
		}
	};

	app.hash.on('.*', function (to, from) {
		var stack = [].concat(app.hash.stack) // clone

		!function next () {
			var fn = stack.shift()
			if ('function' === typeof fn) {
				fn(to, from, next);
			}
		}();

	});


	/**
	 * Bind a callback for when the dom is ready
	 *
	 * @api public
	 * @param {Function} `fn`
	 */

	app.ready = function (fn) {
		if ('function' !== typeof fn) throw new TypeError("expecting `function`");
		else domeready(fn.bind(this));
		return this;
	};


	/**
	 * Logs messages to stdout (console) if
	 * debugging is enabled via the `.enable('debug')`
	 * function call
	 *
	 * @api public
	 */

	app.debug = function () {
		debug(app.name).apply(null, arguments);
		return this;
	};


	/**
	 * Returns the query string parsed or
	 * a value of a provided argument
	 *
	 * @api public
	 * @param {String} `arg` - optional
	 */

	app.query = function (arg) {
		var parsed = qs.parse(this.location.search.substr(1)) || {}
		if (undefined === arg) return parsed;
		else return parsed[arg];
	};


	/**
	 * This function should be called when
	 * the page has loaded
	 *
	 * @api public
	 * @param {}
	 */

	app.init = function (url) {
		var request = new Request(url)

		if (!this.stack.length) return this;

		!function next () {
			var fn = app.stack.shift()
			if ('function' === typeof fn) {
				fn(request, next);
			}
		}();

		return this;
	};
	
	
	/**
	 * Pushes a function to the `.stack` for
	 * filtering during a page request
	 *
	 * @api public
	 * @param {Function} `fn`
	 */

	app.use = function (fn) {
		this.stack.push(fn);
		return this;
	};


	/**
	 * Enables certain settings
	 *
	 * @api public
	 * @param {String} `setting`
	 */

	app.enable = function (setting) {
		switch (setting) {
			case 'debug':
				debug.enable(app.name);
				break;

			default:
				settings[setting] = true;
		}

		return this;
	};


	/**
	 * Disables certain settings
	 *
	 * @api public
	 * @param {String} `setting`
	 */

	app.disable = function (setting) {
		switch (setting) {
			case 'debug':
				debug.disable(app.name);
				break;

			default:
				settings[setting] = false;
		}

		return this;
	};


	/**
	 * Pushes a route to match to the stack
	 *
	 * @api public
	 * @param {String} `url`
	 * @param {Function} `fn`
	 */

	app.route = 
	app.match = function (url, fn) {
		var route = new Route({
			url: url, fn: fn
		});

		this.use(function (req, next) {
			if (route.test(req.pathname)) {
				req.params = route.parse(req.url)
				route.fn(req, next);
			} else {
				next();
			}
		});

		return this;
	};


	/**
	 * Asynchronously load views
	 *
	 * @api public
	 * @param {String} `name`
	 * @param {}
	 */

	app.view = function (name, data, fn) {
		fn = ('function' === typeof data)? data : fn;
		data = ('object' === typeof data)? data : {};

		if ('function' === typeof cache.view[name]) {
			wait(fn.bind(null, decodeURIComponent(cache.view[name](data), null)));
			return this;
		}

		request
			.get('/view/'+ name.replace(/\./g,'/'))
			.set('Accept', 'application/json')
			.end(function (res) {
				var tpl = cache.view[name] = dot.template(res.text || '');
				if ('function' === typeof fn) decodeURIComponent(fn(null, tpl(data)));
			});

		return this;
	};


	/**
	 * Asynchronously load modules
	 *
	 * @api public
	 * @param {String} `name`
	 * @param {}
	 */

	app.module = function (name, data, fn) {
		fn = ('function' === typeof data)? data : fn;
		data = ('object' === typeof data)? data : {};

		if ('function' === typeof cache.module[name]) {
			wait(fn.bind(null, decodeURIComponent(cache.module[name](data), null)));
			return this;
		}

		request
			.get('/module/'+ name.replace(/\./g,'/'))
			.set('Accept', 'application/js')
			.end(function (res) {
				var src = res.text
				  , mod = {exports: {}}
				  , modFn = new Function ('require', 'module', 'exports', ('\n//@ sourceURL='+ res.req.url +'.js\n' + src)).bind(global);

				try {
					modFn(require, mod, mod.exports);
					fn(null, mod.exports, mod);
				} catch (e) {
					fn(e);
				}

			});

		return this;
	};

	return app;
}


/**
 * `Router` constructor
 *
 * @api public
 * @param {Object} `opts`
 */

sfap.Route = Route;
function Route (opts) {
	if ('object' !== typeof opts) throw new TypeError("expecting object");
	else if (undefined === opts.url) throw new TypeError("expecting `.url`");
	else if (undefined === opts.fn) throw new TypeError("expecting `.fn`");

	this.url = opts.url;
	this.regex = sregex(opts.url);
	this.fn = opts.fn;
}


/**
 * Returns true if the provided url matches the route
 *
 * @api public
 * @param	{String} `url`
 */

Route.prototype.test = function (url) {
	return this.regex.test(url);
};


/**
 * Parses a url into variables defined
 * by the route
 *
 * @api public
 * @param	{String} `url`
 */

Route.prototype.parse = function (url) {
	return this.regex.parse(url);
};


/**
 * `Request` constructor
 *
 * @api public
 */

sfap.Request = Request;
function Request (url) {
	EventEmitter.call(this);
	var parsed = parseUrl(url);
	this.url = url;
	this.hash = parsed.hash;
  this.host = parsed.host;
  this.port = parsed.port;
  this.hostname = parsed.hostname;
  this.href = parsed.href;
  this.pathname = parsed.pathname;
  this.protocol = parsed.protocol;
  this.query = parsed.query;
  this.search = parsed.search;
}

// inherit from `EventEmitter`
Request.prototype.__proto__ = EventEmitter.prototype;


