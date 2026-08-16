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
    functions: FunctionModel[];
    resources: ResourceModel[];
}

export interface ComponentImplementationModel {
    world: string;
    functions: FunctionModel[];
    interfaces: InterfaceModel[];
}
