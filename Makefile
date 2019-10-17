test:
	@npm test

test-cov: clean
	@npm run cover
	@npm run report

clean:
	rm -rf ./coverage ./.nyc_output

.PHONY: test-cov test
