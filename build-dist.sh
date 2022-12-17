./node_modules/.bin/ncc build src/jsct.js -o dist-cli
chmod +x dist-cli/wasm2js dist-cli/wasm-opt
echo {} > dist-cli/package.json
mv dist-cli/index.js dist-cli/cli.mjs
cp dist-cli/* dist/
rm -r dist-cli

./node_modules/.bin/ncc build src/api.js -o dist-api
chmod +x dist-api/wasm2js dist-api/wasm-opt
echo {} > dist-api/package.json
mv dist-api/index.js dist-api/api.mjs
cp dist-api/* dist/
rm -r dist-api
