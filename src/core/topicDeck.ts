// The rules-and-traps deck: a few cards for every topic the plan teaches, in plain words. Rules and
// traps only, never a whole question (spec: Flashcards). A topic's cards come in the day you first work
// on it; a trap's cards come in the first time you tag a question with it.
//
// Keys: a quant topic or DI type ("percents", "table analysis"), "data sufficiency", "rc", "cr",
// "cr:<the plan's CR question family>", "tag:<a review tag>".

import type { Section } from "./content";
import { DI_TYPES, QUANT_TOPICS } from "./topics";

export interface DeckCard { id: string; key: string; front: string; back: string }

const deck: [string, [string, string][]][] = [
  ["algebra", [
    ["Two equations, two unknowns", "Add or subtract them to remove one variable; substitute when one is already written as x = …"],
    ["A quadratic equal to zero", "Get everything on one side, factor, and set each factor to 0: (x − 3)(x + 2) = 0 gives x = 3 or x = −2."],
    ["Dividing both sides by x", "Don't: x could be 0. Move everything to one side and factor: x² = 3x → x(x − 3) = 0, so x = 0 or 3."],
    ["(a + b)²", "a² + 2ab + b². Not a² + b²."],
    ["a² − b²", "(a + b)(a − b). It works on numbers too: 99 × 101 = 100² − 1."],
    ["How many equations do you need?", "Usually one different equation per unknown. In DS, one equation can be enough when the question asks for a combination such as x + y."],
    ["f(x + 1)", "Replace every x in the rule with (x + 1), brackets and all."],
    ["Variables in the answer choices", "Pick simple numbers for the variables (not 0 or 1), work out the target, then test each choice."],
  ]],
  ["arithmetic", [
    ["Order of operations", "Brackets, powers, × and ÷ left to right, then + and − left to right."],
    ["Dividing by a fraction", "Multiply by its reciprocal: 6 ÷ 2/3 = 6 × 3/2 = 9."],
    ["Comparing two fractions", "Cross-multiply: 5/8 vs 3/5 → 25 vs 24, so 5/8 is bigger."],
    ["Adding fractions", "Common denominator first: 1/4 + 1/6 = 3/12 + 2/12 = 5/12."],
    ["When does a fraction give a terminating decimal?", "In lowest terms, when its denominator has no prime factors other than 2 and 5."],
    ["A big calculation", "Simplify before you multiply: cancel common factors, factor out repeats, and estimate when the choices are far apart."],
    ["The sign of a product", "An even number of negative factors gives a positive product; an odd number gives a negative one."],
    ["Squaring a number between 0 and 1", "It gets smaller: (1/2)² = 1/4. Its square root is bigger than it."],
  ]],
  ["absolute values", [
    ["|x|", "The distance of x from 0, so it's never negative: |−5| = |5| = 5."],
    ["|x − 3| = 5", "Two cases: x − 3 = 5 or x − 3 = −5, so x = 8 or x = −2."],
    ["|x − a| < b", "x is within b of a: a − b < x < a + b."],
    ["|x − a| > b", "x is more than b away from a: x < a − b or x > a + b."],
    ["√(x²)", "|x|, not x. If x = −3, √(x²) = 3."],
    ["|x| = −x", "True when x is 0 or negative."],
    ["After solving with x on both sides", "Put each answer back into the original equation; one of the cases can fail."],
  ]],
  ["inequalities", [
    ["Multiplying or dividing by a negative", "Flip the sign: −2x > 6 → x < −3."],
    ["Multiplying both sides by a variable", "Not unless you know its sign. Move terms to one side instead."],
    ["Combining two inequalities", "You can add two that point the same way: a > b and c > d give a + c > b + d. Never subtract them."],
    ["x² < 9", "−3 < x < 3."],
    ["x² > 9", "x > 3 or x < −3."],
    ["The range of x − y", "Test the extreme combinations: with 1 < x < 4 and 2 < y < 3, x − y runs from 1 − 3 to 4 − 2, so −2 < x − y < 2."],
    ["Integers from an inequality", "Write them out: 2 < x < 5 with x an integer means x is 3 or 4."],
  ]],
  ["exponents", [
    ["a^m × a^n", "a^(m + n): same base, add the powers."],
    ["(a^m)^n", "a^(m × n)."],
    ["a^(−n)", "1 / a^n: 2^(−3) = 1/8."],
    ["a^0", "1, for any a that isn't 0."],
    ["Different bases", "Rewrite to a common base: 4^x = 8 → 2^(2x) = 2^3, so x = 3/2."],
    ["2^n + 2^n", "2 × 2^n = 2^(n + 1). When equal terms are added, factor them out."],
    ["A negative base", "(−2)^even is positive, (−2)^odd is negative. −2² is −4, but (−2)² is 4."],
    ["The units digit of a power", "Units digits repeat in cycles of up to 4 (2, 4, 8, 6 for powers of 2). Divide the power by 4 and use the remainder."],
  ]],
  ["roots", [
    ["√a × √b", "√(ab): √2 × √8 = √16 = 4."],
    ["√(a + b)", "Not √a + √b: √(9 + 16) = 5, not 7."],
    ["Simplifying a root", "Pull out square factors: √72 = √(36 × 2) = 6√2."],
    ["A root in the denominator", "Multiply top and bottom by the root: 1/√2 = √2/2. With a + √b underneath, use a − √b."],
    ["√25 vs x² = 25", "The √ sign means the positive root, so √25 = 5. The equation x² = 25 has two answers, 5 and −5."],
    ["Cube roots of negatives", "They exist: ∛(−8) = −2."],
    ["Roots worth knowing", "√2 ≈ 1.41, √3 ≈ 1.73, √5 ≈ 2.24."],
  ]],
  ["word problems", [
    ["Turning words into maths", "'is' means =, 'of' means ×. '5 less than x' is x − 5, not 5 − x."],
    ["Before writing an equation", "Name the unknown and its units, and say what each number in the question stands for."],
    ["Age questions", "Everyone gets older by the same amount: 'in 5 years' adds 5 to each person."],
    ["Two kinds of item at two prices", "Two equations: one for how many items, one for the total cost."],
    ["Answer choices that are plain numbers", "Work backwards: try the middle choice, see whether it's too big or too small, and move from there."],
    ["Largest or smallest possible value", "Push every other quantity to its own extreme to make room for the one asked about."],
    ["Consecutive integers", "Call them n, n + 1, n + 2. Their average is the middle one."],
  ]],
  ["ratios", [
    ["A ratio of 3:5", "Parts, not amounts: the amounts are 3k and 5k for some k, and the total is 8k."],
    ["A ratio as a fraction", "In 3:5, the first is 3/8 of the total, not 3/5."],
    ["Combining two ratios", "Match the shared term: a:b = 2:3 and b:c = 4:5 → a:b:c = 8:12:15."],
    ["Adding to one part of a ratio", "Write the new ratio with the change: (3k + 4) / 5k = 1, then solve for k."],
    ["Ratio questions without totals", "Pick a total that fits every ratio, such as a common multiple of the parts."],
    ["Direct vs inverse", "Direct: y = kx, the two rise together. Inverse: y = k/x, their product stays the same."],
    ["Mixtures", "Track the pure ingredient: amount = concentration × volume, before and after."],
  ]],
  ["percents", [
    ["Percent change", "(new − old) / old. Divide by the original."],
    ["Up 20%, then down 20%", "1.2 × 0.8 = 0.96: a 4% drop overall, not zero."],
    ["x% of y", "Equals y% of x: 8% of 25 = 25% of 8 = 2."],
    ["Two changes in a row", "Multiply the factors: up 10% twice is 1.1 × 1.1 = 1.21, a 21% rise."],
    ["The original, after a change", "Divide by the factor: after a 25% rise to 100, the original is 100 / 1.25 = 80."],
    ["Percentage points vs percent", "From 10% to 15% is 5 percentage points, but a 50% increase."],
    ["Profit percent", "Profit = revenue − cost. Check what the percent is of: usually cost, sometimes the selling price."],
    ["Simple vs compound interest", "Simple: P × r × t. Compound: P(1 + r)^t. Compounding more often gives a little more."],
  ]],
  ["rates", [
    ["Distance, rate, time", "D = R × T. Get the units to match first (minutes or hours)."],
    ["Average speed", "Total distance / total time. Not the average of the speeds."],
    ["The same distance at two speeds", "Average speed = 2ab / (a + b), which is below the simple average."],
    ["Two things moving", "Toward each other: add the speeds. Same direction: subtract them."],
    ["Working together", "Add rates, not times: 1/a + 1/b = 1/t."],
    ["Rate of work", "Jobs per hour. Three machines at the same rate do three times the work in the same time."],
    ["Catching up", "Time to catch up = the head start's distance / the difference in speeds."],
    ["Setting up a rate question", "A table with a row for each person (and one for together): rate × time = distance or work."],
  ]],
  ["overlapping sets", [
    ["Two groups", "Total = A + B − both + neither."],
    ["Two yes/no traits", "Draw a 2 × 2 table with totals. Fill in what you know; the rest follows."],
    ["Three groups", "Total = A + B + C − (in exactly two) − 2 × (in all three) + neither."],
    ["Smallest and largest overlap", "The overlap is at least A + B − total (if that's positive) and at most the smaller of A and B."],
    ["'Exactly two' vs 'at least two'", "Exactly two leaves out those in all three. Check which one the question asks for."],
    ["Sets given in percents", "Take the total as 100 and work in counts."],
  ]],
  ["sequences", [
    ["Arithmetic sequence", "The same difference each step: term n = first + (n − 1) × d."],
    ["Sum of an arithmetic sequence", "Number of terms × (first + last) / 2."],
    ["Counting terms", "From a to b in steps of d: (b − a)/d + 1. The integers from 10 to 50 inclusive: 41."],
    ["Geometric sequence", "The same ratio each step: term n = first × r^(n − 1)."],
    ["A rule defined by earlier terms", "Write out the first few terms; the pattern or cycle usually shows quickly."],
    ["1 + 2 + … + n", "n(n + 1)/2. Up to 100: 5,050."],
  ]],
  ["statistics", [
    ["Mean", "Sum / count. Sum = mean × count is often the quicker way in."],
    ["Median", "The middle value once sorted. With an even count, the average of the two middle ones."],
    ["Mode", "The most frequent value. A set can have more than one."],
    ["Range", "Largest − smallest."],
    ["Standard deviation", "How spread out values are around the mean. Adding the same number to every value leaves it unchanged; multiplying every value by k multiplies it by |k|."],
    ["Adding a value equal to the mean", "The mean stays the same and the standard deviation goes down."],
    ["Weighted average", "Sum of (value × weight) / total weight. It lands nearer the heavier group."],
    ["Evenly spaced set", "Mean = median = (first + last) / 2."],
  ]],
  ["multiples and factors", [
    ["Prime factorisation", "Break the number into primes: 360 = 2³ × 3² × 5. Most factor questions start here."],
    ["How many factors?", "Add 1 to each prime's power and multiply: 360 = 2³ × 3² × 5 has 4 × 3 × 2 = 24."],
    ["Greatest common factor", "The lowest power of each prime they share."],
    ["Least common multiple", "The highest power of every prime that appears in either."],
    ["GCF × LCM", "For two numbers, it equals their product."],
    ["Divisible by 3 or 9", "When the sum of the digits is divisible by 3 (or 9)."],
    ["Divisible by 4 or 8", "Last two digits divisible by 4; last three divisible by 8."],
    ["Factorials", "n! has every integer from 1 to n as a factor. Its trailing zeros = the number of 5s in its prime factors."],
  ]],
  ["remainders", [
    ["The remainder form", "x = qd + r, with 0 ≤ r < d. 'Remainder 3 when divided by 5': x is 3, 8, 13, …"],
    ["Test numbers", "List the first few numbers that fit the remainder rule, then answer for those."],
    ["Remainder of a sum or product", "Find each remainder, add or multiply them, then take the remainder again."],
    ["Remainder of a power", "Find the cycle: powers of 3 divided by 5 leave 3, 4, 2, 1, then repeat."],
    ["Two remainder rules at once", "List numbers that fit each, find the first that fits both; after that they repeat every LCM."],
    ["Remainder from a decimal", "x/d = q + r/d. If 17/5 = 3.4, the remainder is 0.4 × 5 = 2."],
  ]],
  ["number properties", [
    ["Even and odd", "even ± even = even; odd ± odd = even; even × anything = even; odd × odd = odd."],
    ["Zero", "Even, neither positive nor negative, and a multiple of every integer."],
    ["1 and 2", "1 isn't prime. 2 is the smallest prime and the one even prime."],
    ["Is it positive?", "Test negatives, zero and fractions as well as positive whole numbers."],
    ["n consecutive integers", "They include one multiple of n, and their product is divisible by n!."],
    ["What to test", "When a question says integer, test 0 and negatives. When it doesn't, test fractions too."],
    ["x² = x and x³ = x", "x² = x: x is 0 or 1. x³ = x adds −1."],
    ["Primes under 50", "2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47."],
  ]],
  ["probability", [
    ["Probability", "Favourable outcomes / all outcomes, when every outcome is equally likely."],
    ["A and B, independent", "Multiply: P(A) × P(B)."],
    ["A or B", "P(A) + P(B) − P(both). Add straight when they can't both happen."],
    ["At least one", "1 − P(none). Usually the quickest way."],
    ["Without replacement", "The second draw changes: 2 red of 5, then 1 red of the 4 left."],
    ["A sanity check", "A probability is between 0 and 1. Anything outside that is a slip."],
    ["One red and one blue", "When order doesn't matter, count both orders: red then blue, and blue then red."],
  ]],
  ["combinations & permutations", [
    ["The counting principle", "Ways for step 1 × ways for step 2 × …"],
    ["Does order matter?", "Arranging (order matters): n!/(n − k)!. Choosing a group (order doesn't): n!/(k!(n − k)!)."],
    ["5C2", "10. Choosing k is the same count as leaving out n − k."],
    ["Arrangements with repeats", "Divide by the repeats: the letters of LEVEL give 5!/(2! × 2!) = 30."],
    ["Two people together", "Glue them into one block, arrange the blocks, then arrange inside the block."],
    ["Two people apart", "All arrangements − the ones where they're together."],
    ["Around a table", "(n − 1)! ways to seat n people in a circle."],
  ]],
  ["data sufficiency", [
    ["DS: what counts as enough", "One value, or always yes or always no. Two possible values isn't enough."],
    ["DS: two equations", "Two different linear equations in two unknowns are enough, unless one is a multiple of the other."],
    ["DS: the statements disagree?", "They never do; both are true. If your work says they conflict, check it."],
    ["DS: words in the question", "Integer, positive, distinct: note them. They can make a statement enough."],
    ["DS: what not to assume", "Unless it says integer, x can be a fraction. Unless it says positive, x can be negative or zero."],
    ["DS: a ratio", "It tells you proportions, not amounts: enough for 'what fraction', not for 'how many'."],
    ["DS: when together looks obvious", "Check each statement alone first. One of them is often enough on its own."],
  ]],
  ["graphics interpretation", [
    ["Before the question", "Read the title, the legend and both axes, including whether the scale starts at zero."],
    ["Share vs amount", "A bigger percentage share can be a smaller amount when the totals differ."],
    ["Estimating from a chart", "Read by eye; the drop-down choices are usually far enough apart to estimate."],
    ["'Increased by' vs 'by a factor of'", "'By' is the difference; 'by a factor of' is the ratio."],
    ["Two y-axes", "Check which axis each line or bar uses before reading it."],
  ]],
  ["table analysis", [
    ["Sorting", "On the real test you can sort a column. Sort by the column the statement is about."],
    ["Yes/no statements", "Judge each on its own. One counterexample makes it false."],
    ["Median from a table", "Sort the column and count to the middle row."],
    ["Percent columns", "Percents from different rows can't be added unless they share the same base."],
    ["Column headings", "Check the units: thousands, millions, percent."],
  ]],
  ["two-part analysis", [
    ["Two columns", "Each column answers its own question; one option can be right for both."],
    ["Linked parts", "When the parts depend on each other, solve one, then use it to find the other."],
    ["Verbal two-part", "Treat it like CR: work out what each column asks for in the argument."],
    ["Test the options", "Try the options in the condition rather than solving from scratch."],
    ["Both parts count", "No half marks: check the second column as carefully as the first."],
  ]],
  ["multi-source reasoning", [
    ["The tabs", "Skim every tab first: what each source is about and how they relate."],
    ["Which tab?", "For each question, find the tab that holds the information before answering."],
    ["Sources that disagree", "They can update or contradict each other; note dates and conditions."],
    ["Yes/no sets", "Three statements, an answer for each, and each needs its own evidence."],
    ["Time", "About 7–9 minutes for a set of three; the first question takes longest because of the reading."],
  ]],
  ["rc", [
    ["RC: the passage's structure", "Before the questions, sum up each paragraph in a few words: claim, evidence, objection, reply."],
    ["RC: contrast words", "However, but, yet, although: the author's real point usually comes after them."],
    ["RC: science passages", "You don't need the science. Track what was believed, what was found, and who disagrees."],
    ["RC: purpose questions", "Ask why the author put it there: to support, to contrast, to give an example. The answer names its role."],
    ["RC: the author's attitude", "Find the author's own words of judgement. GMAT authors are usually measured: 'cautiously optimistic', rarely 'scathing'."],
    ["RC: main idea trap", "A choice that's true but covers one paragraph is too narrow."],
    ["RC: inference trap", "A choice that could be true isn't enough. It has to follow from the passage."],
    ["RC: detail trap", "Wrong choices reuse the passage's words with a changed meaning. Match the meaning, not the words."],
  ]],
  ["cr", [
    ["CR: cause and effect", "X came with Y, so X causes Y? Check for the reverse, a third factor, or coincidence."],
    ["CR: numbers vs percents", "A rising percentage can be a falling number, and the other way round."],
    ["CR: the conclusion", "Look for words like so, therefore, thus, and the claim everything else supports."],
  ]],
  ["cr:strengthen/weaken", [
    ["CR: weaken", "Attack the gap between evidence and conclusion: another cause, or a reason the evidence doesn't apply."],
    ["CR: strengthen", "Close the gap: rule out another cause, or show the evidence is representative."],
  ]],
  ["cr:assumption", [
    ["CR: a necessary assumption", "Something the argument needs: it links the evidence to the conclusion, or rules out another explanation."],
  ]],
  ["cr:evaluate the argument", [
    ["CR: evaluate", "Pick the question whose answer would change your view: one answer helps the argument, the other hurts it."],
  ]],
  ["cr:inference", [
    ["CR: what follows from the facts", "Use the facts given and nothing new. The right answer is usually modest."],
  ]],
  ["cr:except", [
    ["CR: EXCEPT questions", "Four choices do the task. Label each one; the odd one out is the answer."],
  ]],
  ["cr:paradox", [
    ["CR: a paradox", "Find the choice that lets both facts be true at once."],
  ]],
  ["cr:boldface", [
    ["CR: boldface", "Label each part's role (conclusion, evidence, an opposing view), then match roles, not wording."],
  ]],
  ["cr:fill-in-the-blank", [
    ["CR: fill in the blank", "Read the word before the blank: 'since' wants evidence, 'therefore' wants a conclusion."],
  ]],
  ["tag:contradicts the passage", [["Trap: contradicts the passage", "Before choosing, find the line that supports it. If a line says the opposite, it's out."]]],
  ["tag:not supported", [["Trap: not supported", "It might be true in the world, but the text doesn't say it. Choose from the text."]]],
  ["tag:out of scope", [["Trap: out of scope", "It's about something the argument doesn't discuss: a different group, time or measure."]]],
  ["tag:too narrow", [["Trap: too narrow", "True, but it covers a part. The question asks about the whole."]]],
  ["tag:only half", [["Trap: half right", "Half the choice fits and half doesn't. Read every word; one wrong half makes it wrong."]]],
  ["tag:too strong or weak", [["Trap: too strong or too weak", "Watch all, never, always, most, some. The right answer matches the strength of the evidence."]]],
  ["tag:wrong comparison", [["Trap: wrong comparison", "It compares different things than the passage does, or flips which is bigger."]]],
  ["tag:right words, wrong meaning", [["Trap: right words, wrong meaning", "It borrows the passage's phrasing but changes the relationship. Say it in your own words before you agree."]]],
  ["tag:careless", [
    ["Careless slips: the check", "Before you pick: units, sign, and what's being asked (x or x + 1, the total or each one)."],
    ["Careless slips: rough work", "Each step on its own line, so a slip is easy to spot when you check."],
  ]],
  ["tag:timing", [
    ["Timing: method first", "Get the method right with no clock. Then do the same kind with one."],
    ["Timing: two minutes", "At about two minutes with no clear way in, guess the likeliest answer and move on."],
  ]],
  ["pacing", [
    ["Pacing a 45-minute section", "About question 5 with 35 minutes left, 10 with 25, 15 with 15. Short on time? Guess sooner on the next one you can't see into."],
    ["The one-minute rule", "A minute in with no clear way forward: cross out what you can, make your best guess, move on."],
    ["Blanks", "A blank costs more than a guess. Answer every question, even with a quick guess in the last seconds."],
    ["After a sprint", "Retry the ones you guessed with no clock before reading any solution: that shows whether it was time or the method."],
  ]],
  ["tag:concept", [["A concept gap: what helps", "The topic's video again, then easier questions on it before harder ones."]]],
  ["tag:process", [["A process slip: what helps", "Write out the steps for this type of question, then do two more the same way."]]],
];

const slug = (k: string) => k.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

export const TOPIC_DECK: DeckCard[] = deck.flatMap(([key, cards]) => cards.map(([front, back], i) => ({ id: `tc:${slug(key)}:${i + 1}`, key, front, back })));

/** Every topic the plan teaches, for the coverage list: the quant topics, the five DI types, reading and CR. */
export const CORE_TOPICS: string[] = [...QUANT_TOPICS, ...DI_TYPES, "rc", "cr"];

export function sectionOfKey(key: string): Section {
  if (key === "rc") return "rc";
  if (key === "cr" || key.startsWith("cr:")) return "cr";
  if ((DI_TYPES as readonly string[]).includes(key)) return "di";
  if (key.startsWith("tag:")) {
    const t = key.slice(4);
    return ["concept", "process", "careless", "timing"].includes(t) ? "quant" : "cr";
  }
  return "quant";
}

export const deckFor = (key: string) => TOPIC_DECK.filter((c) => c.key === key);
