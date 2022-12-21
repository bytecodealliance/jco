./node_modules/.bin/ncc build src/jsct.js -o dist-cli
chmod +x dist-cli/wasm2js dist-cli/wasm-opt
echo {} > dist-cli/package.json
mv dist-cli/index.js dist-cli/cli.mjs

./node_modules/.bin/ncc build src/api.js -o dist-api
chmod +x dist-api/wasm2js dist-api/wasm-opt
mv dist-api/index.js dist-api/api.mjs

rm -r dist
mkdir dist

cp dist-cli/* dist/
cp dist-api/* dist/

rm -r dist-api dist-cli

cp package.dist.json dist/package.json
cp api.d.ts dist/
cp README.md dist/
