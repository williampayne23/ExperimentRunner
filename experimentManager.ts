import OpenAI from "openai";
import { ExperimentREPL } from "./experimentREPL";

export type IRunStatus = "COMPLETE" | "INCOMPLETE" | "FAIL" | "READY";

export type SerializedRun<T extends Run<any, any>> = ReturnType<T["serialized"]>;

export type IRunner<T, G = string> = {
    setup: (run: Run<T, G>) => Promise<boolean> | boolean;
    step: (run: Run<T, G>) => Promise<boolean> | boolean;
    evaluate?: (run: Run<T, G>) => Promise<IScore> | IScore;
};

export type IScore = "CORRECT" | "INCORRECT" | null;

export class Run<T, G = string> {
    context: OpenAI.ChatCompletionMessage[] = [];
    logs: any[] = [];
    status: IRunStatus = "READY";
    data: T;
    answer: G | null = null;
    score: IScore = null;
    runner: IRunner<T, G>;

    constructor(runner: IRunner<T, G>, data: T) {
        this.runner = runner;
        this.data = data;
    }

    static fromSerialized<T, U = string>(
        runner: IRunner<T, U>,
        serialized: SerializedRun<Run<T, U>>
    ) {
        const run = new Run(runner, serialized.data);
        run.answer = serialized.answer;
        run.context = serialized.context;
        run.logs = serialized.logs;
        run.status = serialized.status;
        run.score = serialized.score;
        return run;
    }

    res?: (run: Run<T, G>) => void;

    async run() {
        if (this.status != "READY" && this.status != "FAIL") return this;
        if (this.status == "FAIL") {
            this.log("RE RUNNING");
            this.log({ "Old Context": [...this.context] });
        }
        return new Promise<Run<T, G>>(async (res, rej) => {
            this.res = res;
            this.status = "INCOMPLETE";
            let status = await this.runner.setup(this);
            this.log("Setup Complete");
            while (status) {
                try {
                    const t = setTimeout(() => {
                        this.status = "FAIL";
                        rej("Ran out of time")
                    }, 30000)
                    status = await this.runner.step(this);
                    clearTimeout(t);
                } catch (e) {
                    this.status = "FAIL";
                    rej(e)
                    return
                }
            }
            this.status = "COMPLETE";
            if (this.runner.evaluate) this.score = await this.runner.evaluate(this);
            res(this);
        });
    }

    log(obj: any) {
        this.logs.push(obj);
    }

    async stop() {
        if (this.res) {
            this.status = "FAIL";
            this.res(this);
        }
    }

    serialized() {
        return {
            data: this.data,
            answer: this.answer,
            status: this.status,
            context: this.context,
            score: this.score,
            logs: this.logs,
        };
    }
}

export class Batch<T = any, G = string> {
    idcounter = 0;
    runs: { id: number; run: Run<T, G> }[] = [];
    name: string;
    experiment: Experiment<T, G> | undefined;

    clear_run(id: number) {
        this.runs.filter((r) => r.id != id);
    }

    cancelRun(id: number) {
        const matchingRuns = this.runs.filter((run) => run.id == id);
        matchingRuns.forEach((r) => r.run.stop());
    }

    getRun(id: number) {
        return this.runs.find((r) => r.id == id);
    }

    activeRuns() {
        return this.runs.filter((r) => r.run.status == "INCOMPLETE");
    }

    incompleteRuns() {
        return this.runs.filter(
            (r) => r.run.status == "INCOMPLETE" || r.run.status == "READY"
        );
    }
    _getNewId() {
        return this.idcounter++;
    }

    constructor(name: string, runs: Run<T, G>[]) {
        this.name = name;
        this.runs = this.runs.concat(runs.map((r, i) => ({ id: i, run: r })));
    }

    runAll() {
        const promises = this.runs.map((r) =>
            r.run.run().then((r) => {
                if (this.experiment) this.experiment?.onRunComplete();
                return r;
            })
        );
        return Promise.all(promises);
    }

    runFails() {
        const promises = this.runs.map((r) => {
            if (r.run.status != "FAIL") {
                return r;
            }
            return r.run.run().then((r) => {
                if (this.experiment) this.experiment?.onRunComplete();
                return r;
            });
        });
        return Promise.all(promises);
    }
}

export class Experiment<T, G = string> {
    batches: Batch<T, G>[] = [];
    complete: boolean = false;
    cancel_thottled_runs: boolean = false;
    load_from_file: (name: string, ...args: string[]) => Promise<void>;

    constructor(load_from_file: (exp: Experiment<T, G>, name: string, ...args: string[]) => Promise<void>) {
        this.load_from_file = (name: string, ...args: string[]) => load_from_file(this, name, ...args);
    }

    addBatch(batch: Batch<T, G>) {
        batch.experiment = this;
        this.batches.push(batch);
    }

    clear_runs() {
        this.batches = [];
    }

    clear_run(addr: string) {
        const bandr = this.addrToBatchAndRun(addr);
        if (!bandr) return;
        bandr.batch.clear_run(bandr.run.id);
        console.log("Running ", addr);
    }

    startCommandLine() {
        let repl = new ExperimentREPL(this);
        repl.runREPL();
    }

    async runOne(addr: string) {
        const bandr = this.addrToBatchAndRun(addr);
        if (!bandr) return;
        bandr.run.run.run();
        console.log("Running ", addr);
    }

    async runAllBatches() {
        const res = await Promise.all(
            this.batches.flatMap(async (b) => await b.runAll())
        );
        return res.flat();
    }



    runningN: boolean = false;

    async runNAtATime(n: number, addrs: string[]) {
        if (this.runningN) return
        this.runningN = true
        const runs = addrs.flatMap(addr => {
            const bandr = this.addrToBatchAndRun(addr);
            if (!bandr) return;
            return bandr.run.run
        })
        this.cancel_thottled_runs = false
        while (runs.length > 0) {
            const running = runs.splice(0, n);
            await Promise.allSettled(running.map(r => r?.run()))
            if (this.cancel_thottled_runs) {
                this.cancel_thottled_runs = false
                this.runningN = false
                return
            }
        }
        this.runningN = false
    }

    async cancelThrottledRuns() {
        this.cancel_thottled_runs = true;
    }

    async runFails() {
        const res = await Promise.all(
            this.batches.flatMap(async (b) => await b.runFails())
        );
        return res.flat();
    }

    saveInOneFile(name: string) {
        const runs = this.batches.flatMap((b) =>
            b.runs.map((run) => run.run.serialized())
        );
        return Bun.write(name, JSON.stringify(runs, null, 4));
    }

    runList() {
        const runs = this.batches.flatMap((b) =>
            b.runs.map((run) => ({
                address: b.name + ":" + run.id,
                status: run.run.status,
            }))
        );
        return runs;
    }

    onRunComplete() {
        const activeRuns = this.batches.flatMap((b) => b.activeRuns());
        const totalRuns = this.batches.flatMap((b) => b.runs);
        if (activeRuns == totalRuns) this.complete = true;
    }

    getStatus() {
        const incompleteRuns = this.batches.flatMap((b) => b.incompleteRuns());
        const totalRuns = this.batches.flatMap((b) => b.runs);
        if (totalRuns.length == 0) return "";
        return `${(
            (100 * (totalRuns.length - incompleteRuns.length)) /
            totalRuns.length
        ).toFixed(0)}% Complete`;
    }

    addrToBatchAndRun(addr: string) {
        const [batchName, runID] = addr.split(":");
        const batch = this.batches.find((b) => b.name == batchName);
        if (batch) {
            try {
                const run = batch.getRun(Number.parseInt(runID));
                if (run == null) {
                    // return console.log("Not a valid address: Invalid Run ID");
                    return;
                }
                return {
                    batch,
                    run,
                };
            } catch {
                //console.log("Not a valid address: Invalid Run ID");
            }
        } else {
            //console.log("Not a valid address: Invalid Batch");
        }
        return null;
    }

    stopRun(addr: string) {
        const result = this.addrToBatchAndRun(addr);
        if (result == null) return false;
        const { batch, run } = result;
        batch.cancelRun(run.id);
        return true;
    }

    detail(addr: string) {
        const result = this.addrToBatchAndRun(addr);
        if (result == null) return;
        const { run } = result;
        return run.run.serialized();
    }
}

