#include "../gen/biz.h"

#include <pthread.h>

static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t condition = PTHREAD_COND_INITIALIZER;
static int worker_ready;
static int release_worker;

static void *wait_for_signal(void *argument) {
    (void)argument;

    if (pthread_mutex_lock(&mutex) != 0) {
        return (void *)1;
    }

    worker_ready = 1;
    if (pthread_cond_signal(&condition) != 0) {
        pthread_mutex_unlock(&mutex);
        return (void *)1;
    }

    while (!release_worker) {
        if (pthread_cond_wait(&condition, &mutex) != 0) {
            pthread_mutex_unlock(&mutex);
            return (void *)1;
        }
    }

    if (pthread_mutex_unlock(&mutex) != 0) {
        return (void *)1;
    }
    return NULL;
}

uint32_t exports_biz_run(void) {
    pthread_t worker;
    void *worker_result = NULL;

    if (pthread_mutex_lock(&mutex) != 0) {
        return 1;
    }
    if (pthread_create(&worker, NULL, wait_for_signal, NULL) != 0) {
        pthread_mutex_unlock(&mutex);
        return 1;
    }

    while (!worker_ready) {
        if (pthread_cond_wait(&condition, &mutex) != 0) {
            pthread_mutex_unlock(&mutex);
            pthread_join(worker, NULL);
            return 1;
        }
    }

    release_worker = 1;
    if (pthread_cond_signal(&condition) != 0) {
        pthread_mutex_unlock(&mutex);
        pthread_join(worker, NULL);
        return 1;
    }
    if (pthread_mutex_unlock(&mutex) != 0) {
        pthread_join(worker, NULL);
        return 1;
    }

    if (pthread_join(worker, &worker_result) != 0) {
        return 1;
    }

    return worker_result == NULL && pthread_cond_destroy(&condition) == 0 && pthread_mutex_destroy(&mutex) == 0
        ? 0
        : 1;
}