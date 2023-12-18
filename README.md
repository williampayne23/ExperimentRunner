# ExperimentRunner

Adapted from an experiment I was running to allow me to reuse this code. Lets me run lots of LLM calls without
worrying too much about whether they fail because there's CLI tools for rerunning fails, and evaluating outputs. 

It's half opinionated half not since I've been making it more generic as I use it and run into opinionated segments
It's not made for implementing big agents which need to be in docker containers of have lots of tools
It assumes a discrete step function for each experiment
It assumes an evaluation at the end with a binary score
And probably lots of other things


## Example usage

Define types
```typescript
export type ResultType = number

export type ParamsType = {
    A: number,
    B: number,
    model: OpenAI.ChatCompletionCreateParams["model"];
};
```

Define a 'runner'
```typescript
export const runner: IRunner<ParamsType, ResultType> = {
    setup: function(run) {
        //Do some prep work e.g
        run.context = [
            {
                role: "system",
                content: "Add the two numbers provided"
            }
            {
                role: "user",
                content: `A: ${run.data.A} B: ${run.data.B}`
        ]
    },
    step: async function(run) {
        //Probably do an LLM call
        //Return true if the next step should happen
        //Else return false e.g
        return false
    },
    evaluate(run){
        //Do something after the run finishes. Return an evaluation
        run.status = "COMPLETE"
        if ( run.answer == run.data.A + run.data.B  ){
            return "CORRECT"
        }
        return "INCORRECT"
    }
};
```

Construct an experiment from your runner
```typescript
const experiment = new Experiment<ParamsType, ResultType>(
    //Optionally provide a function for reading files and creating a batch of runs
    async (exp, name, string_k) => {
        try {
            const qs = await getQuestions(name);
            const k = parseInt(string_k ?? "1");
            const batch = await batchFromQs(qs, k, "gpt-3.5-turbo");
            exp.addBatch(batch);
        } catch { }
    }
);

experiment.startCommandLine();
```

## Command Line REPL usage


The command line provides a help function (type help, h, or ?)

The main functions at the moment are listing runs (ls), running them in batches of n (run_n), loading configurations from a file
(load), and saving (save)

Many functions accept a query of the form

searh string
r:regex
a:index or index range

These apply their operation on the last output of ls but filter using the query. search string and regex are applied to the run name
and address takes the form of a number or range [a-b] and interprets these as indexes in the table generated by the last ls command

## Datatypes

### Experiment

When experiments save they save with the datatype `SerializedRun[]`

### Batch

Experiments internally contain batches which are named when scheduled
runs are added to the experiment. They are a list of runs.

### Run

A Serialized run looks like this at the moment

```typescript
type SerializedRun {
    data: ParamsType,
    answer: ResultType,
    status: "COMPLETE" | "INCOMPLETE" | "FAIL" | "READY"
    score: "CORRECT" | "INCORRECT" | null
    context: OpenAIAPIChatContext
    logs: any[] //Runners can append to the logs array with run.log()
}
```

A non serialized run contains a reference to the runner and the 'log' function.




