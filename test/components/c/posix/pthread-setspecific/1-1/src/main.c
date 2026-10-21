#include "../gen/biz.h"

#include <pthread.h>

enum { THREAD_COUNT = 3 };

static pthread_key_t value_key;
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t condition = PTHREAD_COND_INITIALIZER;
static int ready_workers;
static int release_workers;

struct thread_value {
    int value;
};

static void *check_thread_value(void *argument) {
    int failed = pthread_setspecific(value_key, argument) != 0;

    if (!failed && pthread_getspecific(value_key) != argument) {
        failed = 1;
    }

    if (pthread_mutex_lock(&mutex) != 0) {
        return (void *)1;
    }
    ++ready_workers;
    pthread_cond_signal(&condition);
    while (!release_workers) {
        if (pthread_cond_wait(&condition, &mutex) != 0) {
            pthread_mutex_unlock(&mutex);
            return (void *)1;
        }
    }
    pthread_mutex_unlock(&mutex);

    if (!failed && pthread_getspecific(value_key) != argument) {
        failed = 1;
    }
    return failed ? (void *)1 : NULL;
}

uint32_t exports_biz_run(void) {
    pthread_t threads[THREAD_COUNT];
    struct thread_value thread_values[THREAD_COUNT];
    struct thread_value main_value = { .value = -1 };
    void *thread_result = NULL;
    int created = 0;
    int failed = 0;

    if (pthread_key_create(&value_key, NULL) != 0 ||
        pthread_setspecific(value_key, &main_value) != 0) {
        return 1;
    }

    for (int index = 0; index < THREAD_COUNT; ++index) {
        thread_values[index].value = index;
        if (pthread_create(&threads[index], NULL, check_thread_value, &thread_values[index]) != 0) {
            failed = 1;
            break;
        }
        ++created;
    }

    if (pthread_mutex_lock(&mutex) != 0) {
        failed = 1;
    } else {
        while (ready_workers < created) {
            if (pthread_cond_wait(&condition, &mutex) != 0) {
                failed = 1;
                break;
            }
        }
        release_workers = 1;
        pthread_cond_broadcast(&condition);
        pthread_mutex_unlock(&mutex);
    }

    for (int index = 0; index < created; ++index) {
        if (pthread_join(threads[index], &thread_result) != 0 || thread_result != NULL) {
            failed = 1;
        }
    }

    if (pthread_getspecific(value_key) != &main_value) {
        failed = 1;
    }
    if (pthread_key_delete(value_key) != 0) {
        failed = 1;
    }

    return failed ? 1 : 0;
}