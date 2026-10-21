#include "../gen/biz.h"

#include <pthread.h>

static void *return_argument(void *argument) {
    return argument;
}

uint32_t exports_biz_run(void) {
    pthread_t workers[3];
    int result_tokens[3] = {42, 43, 44};
    void *worker_result = NULL;

    for (int index = 0; index < 3; index++) {
        if (pthread_create(&workers[index], NULL, return_argument, &result_tokens[index]) != 0) {
            return 1;
    }
    }

    if (pthread_equal(workers[0], pthread_self()) != 0) {
        for (int index = 0; index < 3; index++) {
            pthread_join(workers[index], NULL);
        }
        return 1;
    }

    for (int index = 2; index >= 0; index--) {
        if (pthread_join(workers[index], &worker_result) != 0 ||
            worker_result != &result_tokens[index]) {
            return 1;
        }
    }

    return 0;
}