#include "../gen/biz.h"

uint32_t exports_biz_bump(biz_list_u8_t *data) {
    return data->len;
}
