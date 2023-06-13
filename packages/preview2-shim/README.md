# WASI Preview2 JavaScript Shim

_**Experimental**_ shim modules for the [WASI Preview2](https://github.com/bytecodealliance/preview2-prototyping) component interfaces in JS environments.

Currently supports Node.js and browser versions, but alternative implementations for any JS environments can be supported.

## Implementation Status

| Interface       | Node.js                      | Browser                      |
| --------------- | ----------------------------:|-----------------------------:|
| Clocks          | Pending timezone, poll       | Pending timezone, poll       |
| Filesystem      | Basic read support           | :x:                          |
| HTTP            | :x:                          | :x:                          |
| IO              | Basic FS Streams             | :x:                          |
| Logging         | :heavy_check_mark:           | :heavy_check_mark:           |
| Poll            | :x:                          | :x:                          |
| Random          | :heavy_check_mark:           | :heavy_check_mark:           |
| Sockets         | :x:                          | :x:                          |
| CLI Base        | :heavy_check_mark:           | :heavy_check_mark:           |

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
