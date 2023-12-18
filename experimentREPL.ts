import { z } from "zod";
import { REPL } from "./GenericREPL";
import { Experiment, IRunStatus } from "./experimentManager";


const query = z.string().describe("Query: r:regex, a:address or address range")

export class ExperimentREPL<T, G = string> {
    lastList: { address: string; status: IRunStatus }[] = [];
    experiment: Experiment<T, G>;
    
    constructor(experiment: Experiment<T, G>) {
        this.experiment = experiment;
    }

    getRunAddresses(args: string[]) {
        const res = args
            .flatMap((r) => {
                //Address
                const bandr = this.experiment.addrToBatchAndRun(r);
                if (bandr != null) {
                    return r;
                }
                //Number
                try {
                    const n = parseInt(r);
                    return this.lastList[n].address;
                } catch (e) { }
                const range = r.match(/\[(\d+)-(\d+)\]/);
                if (range) {
                    const firstNumber = parseInt(range[1]);
                    const secondNumber = parseInt(range[2]);
                    if (firstNumber < secondNumber) {
                        return this.lastList
                            .filter((_r, i) => i >= firstNumber && i <= secondNumber)
                            .map((r) => r.address);
                    }
                }
                return null;
            })
            .filter((a) => a != null) as string[];
        if (args.includes("*")) {
            return res.concat(this.lastList.map((l) => l.address));
        } else {
            return res;
        }
    }

    listRuns(query?: string){
            if (query) {
                const regex = query.replace(/^r:/, "");
                const addrMatch = query.replace(/^a:/, "");
                if (query != regex) {
                    this.lastList = this.experiment.runList();
                    const re = new RegExp(regex);
                    this.lastList = this.lastList.filter(
                        (item) => item.address.match(re) || item.status.match(re)
                    );
                } else if (query != addrMatch) {
                    const addresses = this.getRunAddresses([addrMatch]);
                    this.lastList = this.lastList.filter((l) =>
                        addresses.includes(l.address)
                    );
                } else {
                    this.lastList = this.experiment.runList();
                    this.lastList = this.lastList.filter(
                        (item) =>
                            item.address.includes(query) || item.status.includes(query)
                    );
                }
            } else {
                this.lastList = this.experiment.runList();
            }
            console.table(this.lastList);
            return;
    }

    runREPL() {
        const repl = new REPL();
        repl.addFunction({
            aliases: ["list", "ls"],
            parser: z.tuple([query.optional()]),
            run: (query) => {
                this.listRuns(query);
            },
            description: "List all runs",
        });
        repl.addFunction({
            aliases: ["rerun_fails"],
            run: () => {
                this.experiment.runFails();
            },
            description: "Rerun all failed runs",
        })
        repl.addFunction({
            aliases: ["save"],
            parser: z.tuple([z.string().describe("Name of file")]),
            run: (name) => {
                this.experiment.saveInOneFile(name);
            },
            description: "Save all results from runs in one file",
        })
        repl.addFunction({
            aliases: ["run_n"],
            parser: z.tuple([z.string().pipe(z.coerce.number()).describe("Number of runs to run at a time"), query.optional()]),
            run: (n, query) => {
                this.listRuns(query);
                try {
                    this.experiment.runNAtATime(n, this.lastList.map(l => l.address))
                } catch { }
            },
            description: "Run n runs at a time",
        })
        repl.addFunction({
            aliases: ["cancel_run_n"],
            run: () => {
                this.experiment.cancelThrottledRuns()
            },
            description: "Cancel all runs that are running or scheduled to run",
        })
        repl.addFunction({
            aliases: ["stop"],
            parser: z.tuple([query]).rest(query),
            run: (...query) => {
                const addresses = this.getRunAddresses(query);
                addresses.forEach((a) => {
                    if (this.experiment.stopRun(a)) {
                        console.log("Stopping ", a);
                    }
                });
            },
            description: "Stop a run",
        })
        repl.addFunction({
            aliases: ["load"],
            parser: z.tuple([z.string().describe("Path to file")]).rest(z.string().describe("Remaining arguments")),
            run: async (path, ...args) => {
                await this.experiment.load_from_file(path, ...args);
            },
            description: "Load from file",
        })
        repl.addFunction({
            aliases: ["clear_runs"],
            run: () => {
                this.experiment.clear_runs();
            },
            description: "Clear all runs from memory",
        })
        repl.addFunction({
            aliases: ["detail"],
            parser: z.tuple([query]).rest(query),
            run: (...query) => {
                const addresses = this.getRunAddresses(query);
                addresses.forEach((a) => {
                    console.log(this.experiment.detail(a));
                });
            },
            description: "Get details of a run",
        })
        repl.addFunction({
            aliases: ["run_one"],
            parser: z.tuple([z.string().describe("Address")]),
            run: (addr) => {
                this.experiment.runOne(addr);
            },
            description: "Run one run",
        })
        repl.run();
    }

}
