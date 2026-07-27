declare module "*.wasm" {
    const component: any;
    export default component;
}

declare module "*.wasm?component" {
    const component: any;
    export default component;
}
