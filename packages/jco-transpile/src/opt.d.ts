type OptimizeOptions = {
    quiet: boolean;
    asyncify?: boolean;
    optArgs?: string[];
    noVerify?: boolean;
};

type OptimizeResult = {
    component: Uint8Array;
    compressionInfo: { beforeBytes: number; afterBytes: number }[];
};
