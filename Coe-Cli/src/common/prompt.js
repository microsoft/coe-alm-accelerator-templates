"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prompt = void 0;
const readline = __importStar(require("readline"));
class Prompt {
    async yesno(text, defaultValue) {
        let rl = readline.createInterface({
            terminal: false,
            input: process.stdin,
            output: process.stdout
        });
        return new Promise((resolve) => {
            rl.question(text, (answer) => {
                if (typeof answer === "undefined" || (answer === null || answer === void 0 ? void 0 : answer.length) == 0) {
                    resolve(defaultValue);
                }
                rl.close();
                switch (answer.trim().toLowerCase()) {
                    case "y": {
                        resolve(true);
                    }
                    case "yes": {
                        resolve(true);
                    }
                    case "n": {
                        resolve(false);
                    }
                    case "no": {
                        resolve(false);
                    }
                    default: {
                        resolve(!defaultValue);
                    }
                }
            });
        });
    }
}
exports.Prompt = Prompt;
//# sourceMappingURL=prompt.js.map