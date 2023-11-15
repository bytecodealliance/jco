## jco Example Workflow

Given an existing Wasm Component, `jco` provides the tooling necessary to work with this Component fully natively in JS.

For an example, consider a Component `cowsay.wasm`:

```shell
- cowsay.wasm
```

Where we would like to use and run this Component in a JS environment.

### Inspecting Component WIT

As a first step, we might like to look instead this binary black box of a Component and see what it actually does.

To do this, we can use `jco wit` to extract the "WIT world" of the Component ([WIT](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md) is the typing language used for defining Components).

```shell
> jco wit cowsay.wasm
world cowsay {
  export cow: interface {
    enum cows {
      default,
      cheese,
      daemon,
      dragon-and-cow,
      dragon,
      elephant-in-snake,
      elephant,
      eyes,
      flaming-sheep
    }

    say: func(text: string, cow: option<cows>) -> string;
  }
}
```

From the above we can see that this Component exports a `cow` interface with a single function export, `say`, taking as input a string, an optional cow, and returning a string.

Alternatively `jco print cowsay.wasm -o out.wat` would output the full concrete Wasm WAT to inspect the Component, with all the implementation details (don't forget the `-o` flag...).

### Transpiling to JS

To execute the Component in a JS environment, use the `jco transpile` command to generate the JS for the Component:

```shell
> jco transpile cowsay.wasm --minify -o cowsay

Transpiled JS Component Files:

 - cowsay/cowsay.core.wasm      2.01 MiB
 - cowsay/cowsay.d.ts           0.73 KiB
 - cowsay/cowsay.js             6.01 KiB
```

Now the Component can be directly imported and used as an ES module:

test.mjs
```js
import { cow } from './cowsay/cowsay.js';

console.log(cow.say('Hello Wasm Components!'));
```

The above JavaScript can be executed in Node.js:

```shell
> node test.mjs

 ________________________
< Hello Wasm Components! >
 ------------------------
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
```

Or it can be executed in a browser via a module script:

```html
<script type="module" src="test.mjs"></script>
```

There are a number of custom transpilation options available, detailed in the [API section](README.md#API).
