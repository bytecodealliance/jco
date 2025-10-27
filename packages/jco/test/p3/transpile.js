import { env } from 'node:process';
import { join, basename } from 'node:path';
import { readFile } from 'node:fs/promises';

import { suite, test, assert } from 'vitest';

import { transpile } from '../../src/api';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

const P3_FIXTURE_COMPONENTS = [
    'backpressure/async_backpressure_callee.component.wasm',
    'backpressure/async_backpressure_caller.component.wasm',

    'sockets/tcp/p3_sockets_tcp_states.component.wasm',
    'sockets/tcp/p3_sockets_tcp_sample_application.component.wasm',
    'sockets/tcp/p3_sockets_tcp_sockopts.component.wasm',
    'sockets/tcp/p3_sockets_tcp_streams.component.wasm',
    'sockets/tcp/p3_sockets_tcp_bind.component.wasm',
    'sockets/tcp/p3_sockets_tcp_connect.component.wasm',
    'sockets/udp/p3_sockets_udp_sockopts.component.wasm',
    'sockets/udp/p3_sockets_udp_bind.component.wasm',
    'sockets/udp/p3_sockets_udp_connect.component.wasm',
    'sockets/udp/p3_sockets_udp_sample_application.component.wasm',
    'sockets/udp/p3_sockets_udp_states.component.wasm',
    'sockets/p3_sockets_ip_name_lookup.component.wasm',

    'fs/p3_filesystem_file_read_write.component.wasm',

    'yield/async_yield_callee_stackless.component.wasm',
    'yield/async_yield_callee_synchronous.component.wasm',
    'yield/async_yield_caller.component.wasm',

    'cli/p3_cli.component.wasm',

    'general/async_post_return_caller.component.wasm',
    'general/async_borrowing_caller.component.wasm',
    'general/async_post_return_callee.component.wasm',
    'general/async_borrowing_callee.component.wasm',
    'general/async_intertask_communication.component.wasm',
    'general/async_transmit_callee.component.wasm',
    'general/async_transmit_caller.component.wasm',

    'round-trip/async_round_trip_stackless.component.wasm',
    'round-trip/async_round_trip_many_wait.component.wasm',
    'round-trip/async_round_trip_direct_stackless.component.wasm',
    'round-trip/async_round_trip_wait.component.wasm',
    'round-trip/async_round_trip_many_stackful.component.wasm',
    'round-trip/async_round_trip_synchronous.component.wasm',
    'round-trip/async_round_trip_many_synchronous.component.wasm',
    'round-trip/async_round_trip_stackful.component.wasm',
    'round-trip/async_round_trip_many_stackless.component.wasm',
    'round-trip/async_round_trip_stackless_sync_import.component.wasm',

    'backpressure/async-backpressure-caller.wasm',
    'backpressure/async-backpressure-callee.wasm',

    'http/p3_http_outbound_request_unknown_method.component.wasm',
    'http/p3_http_outbound_request_invalid_dnsname.component.wasm',
    'http/p3_http_outbound_request_put.component.wasm',
    'http/p3_http_outbound_request_content_length.component.wasm',
    'http/p3_http_echo.component.wasm',
    'http/p3_http_outbound_request_invalid_port.component.wasm',
    'http/p3_http_outbound_request_get.component.wasm',
    'http/p3_http_outbound_request_missing_path_and_query.component.wasm',
    'http/p3_http_middleware_with_chain.component.wasm',
    'http/p3_http_outbound_request_large_post.component.wasm',
    'http/p3_http_outbound_request_post.component.wasm',
    'http/p3_http_outbound_request_invalid_header.component.wasm',
    'http/p3_http_outbound_request_unsupported_scheme.component.wasm',
    'http/p3_http_middleware.component.wasm',
    'http/p3_http_outbound_request_invalid_version.component.wasm',
    'http/p3_http_outbound_request_response_build.component.wasm',
    'http/p3_api_proxy.component.wasm',
    'http/p3_http_outbound_request_timeout.component.wasm',

    'streams/async_unit_stream_callee.component.wasm',
    'streams/async_read_resource_stream.component.wasm',
    'streams/async_closed_streams.component.wasm',
    'streams/async_unit_stream_caller.component.wasm',

    'cancellation/async_cancel_caller.component.wasm',
    'cancellation/async_cancel_callee.component.wasm',

    'poll/async_poll_stackless.component.wasm',
    'poll/async_poll_synchronous.component.wasm',

    'random/p3_random_imports.component.wasm',
    {
    'clocks/p3_clocks_sleep.component.wasm',

    'error-context/async-error-context.wasm',
    'error-context/async-error-context-callee.wasm',
    'error-context/async-error-context-caller.wasm',

    
];

suite('Transpile (WASI P3)', () => {
    if (env.TEST_P3_FIXTURE_TARGET) {
        console.error(
            `TEST_P3_FIXTURE_TARGET specified, only running components that match [${env.TEST_P3_FIXTURE_TARGET}]`
        );
    }
    for (const componentRelPath of P3_FIXTURE_COMPONENTS) {
        const componentPath = join(P3_COMPONENT_FIXTURES_DIR, componentRelPath);
        const componentName = basename(componentPath);

        // Limit to a specific fixture if specified
        if (
            env.TEST_P3_FIXTURE_TARGET &&
            env.TEST_P3_FIXTURE_TARGET !== componentName
        ) {
            continue;
        }

        test.concurrent(`transpile [${componentName}]`, async () => {
            const { files } = await transpile(await readFile(componentPath));
            assert.isNotEmpty(files);
        });
    }
});
