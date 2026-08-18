#include "../gen/biz.h"

uint32_t exports_biz_bump(void) {
    static uint32_t c;
    return ++c;
}
