import { _dropPollable, _pollOneoff } from "../poll/wasi-poll.js";

export const poll = {
  dropPollable (pollable) {
    _dropPollable(pollable);
  },
  pollOneoff (from) {
    return _pollOneoff(from);
  },
};
