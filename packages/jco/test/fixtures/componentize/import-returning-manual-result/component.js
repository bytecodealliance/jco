import { returnErrString, returnErrNull, returnOk } from "jco:test/returns-result";

export const returnsResult = {
    returnErrString() {
        return returnErrString();
    },

    returnErrNull() {
        return returnErrNull();
    },

    returnOk() {
        return returnOk();
    },
};
