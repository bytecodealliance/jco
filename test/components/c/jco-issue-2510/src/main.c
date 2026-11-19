#include <stdio.h>
#include <wasi/wasip2.h>

// Block until the socket's pending operation has finished.
static void block(tcp_borrow_tcp_socket_t socket) {
    tcp_own_pollable_t pollable = tcp_method_tcp_socket_subscribe(socket);
    poll_method_pollable_block(poll_borrow_pollable(pollable));
    poll_pollable_drop_own(pollable);
}

int main(void) {
    network_own_network_t network = instance_network_instance_network();
    tcp_borrow_network_t network_borrow = network_borrow_network(network);
    tcp_ip_socket_address_t address = {
        .tag = NETWORK_IP_SOCKET_ADDRESS_IPV4,
        .val.ipv4 = {.port = 0, .address = {127, 0, 0, 1}},
    };
    tcp_own_tcp_socket_t listener, client;
    tcp_borrow_tcp_socket_t listener_borrow, client_borrow;
    tcp_tuple2_own_input_stream_own_output_stream_t client_streams;
    tcp_tuple3_own_tcp_socket_own_input_stream_own_output_stream_t accepted;
    tcp_own_pollable_t accepted_pollable;
    tcp_error_code_t err;

    if (!tcp_create_socket_create_tcp_socket(NETWORK_IP_ADDRESS_FAMILY_IPV4, &listener, &err)) {
        puts("create failed");
        return 1;
    }
    listener_borrow = tcp_borrow_tcp_socket(listener);
    if (!tcp_method_tcp_socket_start_bind(listener_borrow, network_borrow, &address, &err)) {
        puts("bind failed");
        return 1;
    }
    block(listener_borrow);
    if (!tcp_method_tcp_socket_finish_bind(listener_borrow, &err) ||
        !tcp_method_tcp_socket_start_listen(listener_borrow, &err)) {
        puts("listen failed");
        return 1;
    }
    block(listener_borrow);
    if (!tcp_method_tcp_socket_finish_listen(listener_borrow, &err) ||
        !tcp_method_tcp_socket_local_address(listener_borrow, &address, &err)) {
        puts("listen failed");
        return 1;
    }

    if (!tcp_create_socket_create_tcp_socket(NETWORK_IP_ADDRESS_FAMILY_IPV4, &client, &err)) {
        puts("create failed");
        return 1;
    }
    client_borrow = tcp_borrow_tcp_socket(client);
    if (!tcp_method_tcp_socket_start_connect(client_borrow, network_borrow, &address, &err)) {
        puts("connect failed");
        return 1;
    }
    block(client_borrow);
    if (!tcp_method_tcp_socket_finish_connect(client_borrow, &client_streams, &err)) {
        puts("connect failed");
        return 1;
    }

    block(listener_borrow);
    if (!tcp_method_tcp_socket_accept(listener_borrow, &accepted, &err)) {
        puts("accept failed");
        return 1;
    }
    puts("accepted");

    // Drop the accepted socket the way wasi-libc closes one: its streams
    // first, then the socket's own pollable, then the socket. Each step is
    // a valid WASI 0.2 drop order.
    accepted_pollable = tcp_method_tcp_socket_subscribe(tcp_borrow_tcp_socket(accepted.f0));
    streams_input_stream_drop_own(accepted.f1);
    streams_output_stream_drop_own(accepted.f2);
    poll_pollable_drop_own(accepted_pollable);
    tcp_tcp_socket_drop_own(accepted.f0);
    puts("closed");

    streams_input_stream_drop_own(client_streams.f0);
    streams_output_stream_drop_own(client_streams.f1);
    tcp_tcp_socket_drop_own(client);
    tcp_tcp_socket_drop_own(listener);
    network_network_drop_own(network);
    return 0;
}
