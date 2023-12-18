import readline from "node:readline";
import { z } from "zod";

type Tuple = z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]], z.ZodTypeAny | null>;

type NotUndefined<T extends undefined | Tuple> = T extends undefined ? [] : z.output<Exclude<T, undefined>>;



type REPLFunction<G, T extends Tuple | undefined = undefined> = {
    aliases: string[];
    parser?: T;
    run: (...args: (NotUndefined<T>)) => G;
    description?: string;
};

createREPLFunction({
    aliases: ["add", "a"],
    parser: z.tuple([z.string().pipe(z.coerce.number()), z.string().pipe(z.coerce.number())]),
    run: (a, b) => {
        return a + b;
    }
})

function createREPLFunction<G, T extends Tuple | undefined = undefined>(
    opts: {
        aliases: string[],
        run: (...args: (NotUndefined<T>)) => G,
        parser?: T
        description?: string
    }): REPLFunction<G, T> {

    return {
        ...opts
    }
}

function runREPLFunction<T extends Tuple | undefined, G>(f: REPLFunction<G, T>, args: (string | undefined)[]) {
    if (f.parser) {
        while ( args.length < f.parser.items.length ) {
            args.push(undefined)
        }
        const parsed = f.parser.safeParse(args);
        if (parsed.success) {
            return f.run(...(parsed.data as NotUndefined<T>))
        } else {
            throw new Error(parsed.error.issues.map(i => i.message).join("\n"))
        }
    } else {
        return f.run(...args as any)
    }
}

export class REPL {

    functions: REPLFunction<any, Tuple | undefined>[] = [];

    constructor() {
        this.functions.push({
            aliases: ["help", "h", "?"],
            run: () => {
                console.log("OPTIONS");
                this.functions.forEach(f => {
                    console.log("[", f.aliases.join("|"), "]", f.parser ? f.parser.items.map((_,j) => `args${j}`).join(" ") : "")
                    if (f.description) {
                        console.log(`\t${f.description}`)
                    }
                    if (f.parser) {
                        console.log("\tArguments:")
                        f.parser.items.forEach((i, j) => {
                            console.log(`\t\targ${j}:\t${i.description}`)
                        })
                    }
                    
                })
            },
            description: "Prints this help message"
        })
        this.addFunction({
            aliases: ["exit", "quit", "q"],
            run: () => {
                process.exit(0)
            },
            description: "Exits the REPL"
        })

        this.addFunction({
            aliases: ["clear", "c"],
            run: () => {
                console.clear()
            },
            description: "Clears the console"
        })

    }

    addFunction<G, T extends Tuple | undefined>(
        opts: REPLFunction<G, T>): void {
        this.functions.push(opts as any);
    }

    run() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.on("line", (line) => {
            const fname = line.split(" ")[0];
            const args = line.split(" ").slice(1);
            const f = this.functions.find(f => f.aliases.includes(fname))
            if (f) {
                runREPLFunction(f, args)
            } else {
                console.log("Invalid command")
            }
            process.stdout.write("> ");
        });
        process.stdout.write("> ");
    }

}
