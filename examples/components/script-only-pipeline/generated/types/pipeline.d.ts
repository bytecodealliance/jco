/// <reference path="./interfaces/example-log-pipeline-dataset.d.ts" />
/// <reference path="./interfaces/example-log-pipeline-processor.d.ts" />
declare module 'example:log-pipeline/pipeline' {
  export * as dataset from 'example:log-pipeline/dataset'; // export example:log-pipeline/dataset
  export * as processor from 'example:log-pipeline/processor'; // export example:log-pipeline/processor
}
