/// <reference path="./interfaces/example-log-pipeline-dataset.d.ts" />
/// <reference path="./interfaces/example-log-pipeline-processor.d.ts" />
/// <reference path="./interfaces/example-log-pipeline-types.d.ts" />
declare module 'example:log-pipeline/pipeline' {
  export * as types from 'example:log-pipeline/types'; // export example:log-pipeline/types
  export * as dataset from 'example:log-pipeline/dataset'; // export example:log-pipeline/dataset
  export * as processor from 'example:log-pipeline/processor'; // export example:log-pipeline/processor
}
