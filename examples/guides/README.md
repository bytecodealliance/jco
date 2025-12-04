# Guides

This folder contains walk-throughs that offer a guided tour through concepts and
functionality for using the JS ecosystem WebAssembly tooling (`jco`, `componentize-js`),
often referencing or building up to [example WebAssembly components](./../components) available elsewhere in this repository.

| Guide                                              | Description                                                                                         |
|----------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| [00 - Tooling setup][00]                           | Get started with JS WebAssembly tooling                                                             |
| [01 - Building a Component with `jco`][01]         | Build a simple component ([`add.wasm`][comp-add])                                                   |
| [02 - Running components in Javascript][02]        | How to run components from existing JS code                                                         |
| [03 - Exporting functionality with rich types][03] | Exporting functionality from ([`string-reverse.wasm`][comp-sreverse])                               |
| [04 - Importing and reusing components][04]        | Importing and Exporting advanced functionality ([`string-reverse-upper.wasm`][comp-sreverse-upper]) |
|                                                    |                                                                                                     |

[00]: ./00-tooling-setup.md
[01]: ./01-building-a-component-with-jco.md
[02]: ./02-running-components-in-js.md
[03]: ./03-exporting-functionality-with-rich-types.md
[04]: ./04-importing-and-reusing-components.md

[comp-add]: ../components/add
[comp-sreverse]: ../components/string-reverse
[comp-sreverse-upper]: ../components/string-reverse-upper
