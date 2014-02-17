TESTS = test/*.test.js
TIMEOUT = 25000
REPORTER = spec
MOCHA_OPTS = 
test: 
		@NODE_ENV=test ./node_modules/.bin/mocha \
			--require should \
			--reporter $(REPORTER) \
			--timeout $(TIMEOUT) \
			$(MOCHA_OPTS) \
			$(TESTS)

test-cov:
	@rm -f coverage.html
	@$(MAKE) test MOCHA_OPTS='--require blanket' REPORTER=html-cov > coverage.html
	#@$(MAKE) test MOCHA_OPTS='--require blanket' REPORTER=travis-cov
	@ls -lh coverage.html

clean:
		rm -rf ./lib-cov coverage.html

.PHONY: test-cov lib-cov test
