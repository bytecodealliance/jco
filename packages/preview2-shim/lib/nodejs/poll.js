export const pollPoll = {
  dropPollable (pollable) {
    console.log(`[poll] Drop (${pollable})`);
  },
  pollOneoff (input) {
    console.log(`[poll] Oneoff (${input})`);
    return [];
  }
};

export { pollPoll as poll }
