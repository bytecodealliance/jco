`jco` is a [Bytecode Alliance](https://bytecodealliance.org/) project and follows the Bytecode Alliance's [Code of Conduct](https://raw.githubusercontent.com/bytecodealliance/jco/main/CODE_OF_CONDUCT.md) and [Organizational Code of Conduct](https://raw.githubusercontent.com/bytecodealliance/jco/main/ORG_CODE_OF_CONDUCT.md).

## Using this repository

You can run the website locally using the [mdBook](https://rust-lang.github.io/mdBook/index.html) command line tool.

## Prerequisites

To use this repository, you need [mdBook](https://rust-lang.github.io/mdBook/guide/installation.html) installed on your workstation.

## Running the website locally

After installing mdBook, on GitHub, click the `Fork` button in the upper-right area of the screen to create a copy of the jco repository in your account. This copy is called a fork.

Next, clone it locally by executing the command below.

```shell
git clone https://github.com/bytecodealliance/jco/
cd docs
```

To build and test the site locally, run:

```shell
mdbook serve --open
```

## Submitting Changes

- Follow the instructions above to [make changes to your website locally](./contributing-docs.md#running-the-website-locally).
- When you are ready to submit those changes, go to your fork and create a new pull request to let us know about it.

Everyone is welcome to submit a pull request! Once your pull request is created, we'll try to get to reviewing it or responding to it in at most a few days. As the owner of the pull request, it is your responsibility to modify your pull request to address the feedback that has been provided to you by the reviewer.
