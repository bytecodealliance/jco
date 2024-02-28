## Jco Example Workflow

Given an existing Wasm Component, `jco` provides the tooling necessary to work with this Component fully natively in JS.

Jco also provides an experimental feature for generating components from JavaScript by wrapping [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS) in the `jco componentize` command.

To demonstrate a full end-to-end component, we can create a JavaScript component embedding Spidermnokey then run it in JavaScript.

### Installing Jco

Either install Jco globally:

```shell
$ npm install -g @bytecodealliance/jco
$ jco --version
1.0.3
```

Or install it locally and use `npx` to run it:

```shell
$ npm install @bytecodealliance/jco
$ npx jco --version
1.0.3
```

Local usage can be preferable to ensure the project is reproducible and self-contained, but requires
replacing all `jco` shell calls in the following example with either `./node_modules/.bin/jco` or `npx jco`.

### Installing ComponentizeJS

To use ComponentizeJS, it must be separately installed, locally or globally depending on whether Jco was installed locally or globally:

```shell
$ npm install -g @bytecodealliance/componentize-js
```

Or locally:

```shell
$ npm install @bytecodealliance/componentize-js
```

Now the `jco componentize` command will be ready to use.

### Creating a Component with ComponentizeJS

This Cowsay component uses the following WIT file ([WIT](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md) is the typing language used for defining Components):

cowsay.wit
```wit
package local:cowsay;
world cowsay {
  export cow: interface {
    enum cows {
      default,
      owl
    }
    say: func(text: string, cow: option<cows>) -> string;
  }
}
```

We can implement this with the following JS:

cowsay.js
```js
export const cow = {
  say (text, cow = 'default') {
    switch (cow) {
      case 'default':
return `${text}
  \\   ^__^
    \\  (oo)\\______
      (__)\\      )\/\\
          ||----w |
          ||     ||
`;
      case 'owl':
return `${text}
   ___
  (o o)
 (  V  )
/--m-m-
`;
    }
  }
};
```

To turn this into a component run:

```shell
$ jco componentize cowsay.js --wit cowsay.wit -o cowsay.wasm

OK Successfully written cowsay.component.wasm with imports ().
```

> Note: For debugging, it is useful to pass `--enable-stdout` to ComponentizeJS to get error messages and enable `console.log`.

### Inspecting Component WIT

As a first step, we might like to look instead this binary black box of a Component and see what it actually does.

```shell
$ jco wit cowsay.wasm
package root:component;

world root {
  export cow: interface {
    enum cows {
      cat,
      default,
      owl,
    }

    say: func(text: string, cow: option<cows>) -> string;
  }
}
```

### Transpiling to JS

To execute the Component in a JS environment, use the `jco transpile` command to generate the JS for the Component:

```shell
$ jco transpile cowsay.wasm -o cowsay

Transpiled JS Component Files:

 - cowsay/cowsay.component.core.wasm  7.61 MiB
 - cowsay/cowsay.component.d.ts       0.07 KiB
 - cowsay/cowsay.component.js         2.62 KiB
 - cowsay/interfaces/cow.d.ts         0.21 KiB
```

Now the Component can be directly imported and used as an ES module:

test.js
```js
import { cow } from './cowsay/cowsay.js';

console.log(cow.say('Hello Wasm Components!'));
```

For Node.js to allow us to run native ES modules, we must first create or edit the local `package.json` file to include a `"type": "module"` field:

package.json
```json
{
  "type": "module"
}
```

The above JavaScript can now be executed in Node.js:

```shell
$ node test.js

 Hello Wasm Components!
  \   ^__^
    \  (oo)\______
      (__)\      )/\
          ||----w |
          ||     ||
```

Passing in the optional second parameter, we can change the cow:

test.mjs
```js
import { cow } from './cowsay/cowsay.js';

console.log(cow.say('Hello Wasm Components!', 'owl'));
```

```shell
$ node test.js

 Hello Wasm Components!
   ___
  (o o)
 (  V  )
/--m-m-
```

It can also be executed in a browser via a module script:

```html
<script type="module" src="test.js"></script>
```

There are a number of custom transpilation options available, detailed in the [API section](README.md#API).
