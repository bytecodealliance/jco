export interface FunctionModel {
    name: string;
    parameters: string[];
}

export interface ResourceModel {
    name: string;
    constructorParameters?: string[];
    methods: FunctionModel[];
    staticMethods: FunctionModel[];
}

export interface InterfaceModel {
    name: string;
    importName?: string;
    functions: FunctionModel[];
    resources: ResourceModel[];
}

export interface ComponentImplementationModel {
    world: string;
    typeModule?: string;
    functions: FunctionModel[];
    interfaces: InterfaceModel[];
}
