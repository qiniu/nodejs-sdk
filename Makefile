TESTS = test/*.test.js
REPORTER = spec
TIMEOUT = 5000

test:
		@NODE_ENV=test ./node_modules/mocha/bin/mocha \
				--reporter $(REPORTER) \
				--timeout $(TIMEOUT) \
				$(TESTS)

test-cov:
		@rm -rf ./lib-cov
		@$(MAKE) lib-cov
		@QINIU_COV=1 $(MAKE) test REPORTER=dot
		@QINIU_COV=1 $(MAKE) test REPORTER=html-cov > coverage.html

lib-cov:
		@jscoverage lib $@

.PHONY: test-cov test lib-cov
