
test:
	export NODE_PATH=`pwd`:`pwd`/../node_app/lib; \
	export NODE_NO_READLINE=1; \
	export NODE_NO_COLORS=1; \
	mocha --reporter tap --bail contract.spec.js && echo Every test successful

lint:
	jshint *.js

repl:
	./repl
