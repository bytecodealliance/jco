import process from "node:process";

export function run() {
    process.exit(23);
    return "execution continued after exit";
}

export function denied() {
    try {
        process.chdir("/");
    } catch (error) {
        return error.code;
    }
    return "unexpected host access";
}
