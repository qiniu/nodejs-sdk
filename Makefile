TESTS = test/*.test.js
TIMEOUT = 15000
REPORTER = spec
MOCHA_OPTS = 
test: 
		@NODE_ENV=test ./node_modules/.bin/mocha \
			--require should \
			--reporter $(REPORTER) \
			--timeout $(TIMEOUT) \
			$(MOCHA_OPTS) \
			$(TESTS)

test-cov: lib-cov
#		@QINIU_COV=1 $(MAKE) test REPORTER=dot
		@QINIU_COV=1 $(MAKE) test REPORTER=html-cov > coverage.html
		@rm -rf ./lib-cov
		

lib-cov:
		@jscoverage --no-highlight qiniu $@

clean:
		rm -rf ./lib-cov coverage.html

.PHONY: test-cov lib-cov test
