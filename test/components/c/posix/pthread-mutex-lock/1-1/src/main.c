// Adapted from the Open POSIX Test Suite's pthread_mutex_lock conformance
// test case 1-1 (Copyright (c) 2002 Intel Corporation, GPL-licensed):
// https://github.com/bytecodealliance/wasi-sdk/blob/main/src/wasi-libc/test/open-posix-test-suite/conformance/interfaces/pthread_mutex_lock/1-1.c

#include "../gen/biz.h"

#include <pthread.h>
#include <unistd.h>

#define THREAD_NUM 5
#define LOOPS 4

static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static int value; /* value protected by mutex */

static void *f1(void *parm) {
    (void)parm;

    for (int i = 0; i < LOOPS; ++i) {
        if (pthread_mutex_lock(&mutex) != 0) {
            return (void *)1;
        }

        int tmp = value;
        usleep(1000); /* delay the increment to encourage contention */
        value = tmp + 1;

        if (pthread_mutex_unlock(&mutex) != 0) {
            return (void *)1;
        }
    }

    return (void *)0;
}

uint32_t exports_biz_run(void) {
    pthread_t threads[THREAD_NUM];

    for (int i = 0; i < THREAD_NUM; ++i) {
        if (pthread_create(&threads[i], NULL, f1, NULL) != 0) {
            return 1; /* PTS_FAIL */
        }
    }

    uint32_t rc = 0;
    for (int i = 0; i < THREAD_NUM; ++i) {
        void *retval = NULL;
        pthread_join(threads[i], &retval);
        if (retval != 0) {
            rc = 1; /* PTS_FAIL */
        }
    }

    pthread_mutex_destroy(&mutex);

    /* A broken mutex implementation may cause lost increments. */
    if (value != THREAD_NUM * LOOPS) {
        rc = 1; /* PTS_FAIL */
    }

    return rc; /* PTS_PASS on success */
}
