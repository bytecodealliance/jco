#include "bindings/consumer_cpp.h"

#include <expected>
#include <iostream>

std::expected<void, wit::Void> exports::wasi::cli::run::Run() {
  std::cout << "[dbg] run: minimal begin" << std::endl;
  auto h = ::test::jco_bug::iface::OpenTemp();
  std::cout << "[dbg] run: before append" << std::endl;
  h.Append("|x|");
  std::cout << "[dbg] run: after append" << std::endl;
  return {};
}
