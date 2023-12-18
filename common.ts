import { Console } from "console";
import OpenAI from "openai";
import { Transform } from "stream";
import { AnyZodObject, output } from "zod";

export type Question = {
  question: string;
  answer: string;
};

export type AskResult = {
  answer: string | null;
  stop_reason: "ANSWER" | "TIMOUT" | "NO_ANSWER";
  context: OpenAI.ChatCompletionMessageParam[];
};

export type EvalResult = {
  question: Question;
  answer: string | null;
  context: OpenAI.ChatCompletionMessageParam[];
  stop_reason: AskResult["stop_reason"];
  outcome: "CORRECT" | "INCORRECT" | "FAIL";
};

export type Experiment = {
  qs: string;
  k: number;
  l: number;
  model: OpenAI.ChatCompletionCreateParams["model"];
  result: EvalResult[];
};

export function parseOrNullFunctionArguments<T extends AnyZodObject>(
  json: string | null,
  schema: T
): output<T> | null {
  if (json == null) {
    return null;
  }
  try {
    return schema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function getQuestions(path: string) {
  const file = Bun.file(path);
  const contents = await file.json();
  return contents as Question[];
}

const ts = new Transform({
  transform(chunk, _, cb) {
    cb(null, chunk);
  },
});

const logger = new Console({ stdout: ts });

export function getTable(data: any) {
  logger.table(data);
  const table = (ts.read() || "").toString();
  console.log(table);
}

console.table = getTable;

export type RunParams = {
  question: Question;
  l: number;
  k: number;
  model: OpenAI.ChatCompletionCreateParams["model"];
};
