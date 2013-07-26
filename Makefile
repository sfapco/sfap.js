
build: components index.js
	@rm -f sfap.js
	@component build --dev -o . -n sfap

components: component.json
	@component install --dev

clean:
	rm -fr build components template.js

.PHONY: clean
