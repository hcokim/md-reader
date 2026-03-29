# The Field Guide to Markdown

## A Totally Serious Reference Document

Welcome. You've stumbled upon the most comprehensive, slightly unhinged guide to everything this markdown reader can do. Buckle up.

---

## Table of Contents

1. [Text Formatting](#text-formatting)
2. [Lists of All Kinds](#lists-of-all-kinds)
3. [The Art of the Blockquote](#the-art-of-the-blockquote)
4. [Tables](#tables)
5. [Code](#code)
6. [Math](#math)
7. [Links and Images](#links-and-images)
8. [Highlights and Comments](#highlights-and-comments)
9. [Presentation Mode Tips](#presentation-mode-tips)

---

## Text Formatting

You can make text **bold** when you mean business, *italic* when you're feeling fancy, and ~~strikethrough~~ when you change your mind. Combine them for ***bold italic*** when the situation is truly dire.

You can also use `inline code` for when you need to mention a `variable_name` or a `--flag` in the middle of a sentence.

And of course, there's always the humble horizontal rule to dramatically separate your thoughts:

---

## Lists of All Kinds

### Unordered (The Grocery Run)

- Mass quantities of coffee
- Mass quantities of more coffee
  - Beans (whole, obviously)
  - Emergency instant packets
    - For when you've hit rock bottom
- A single vegetable for appearances

### Ordered (The Morning Ritual)

1. Wake up
2. Question life choices
3. Make coffee (see grocery list above)
4. Open laptop
5. Stare at terminal
6. Actually start working

### Task Lists (The Eternal Backlog)

- [x] Set up project
- [x] Write the fun parts
- [x] Promise to write tests
- [ ] Actually write tests
- [ ] Address tech debt
- [ ] Achieve inbox zero
- [ ] Learn Vim keybindings (aspirational)

---

## The Art of the Blockquote

Simple wisdom:

> The best code is no code at all.

Nested wisdom:

> A senior engineer once told me:
>
> > "Write code as if the person maintaining it is a violent psychopath who knows where you live."
>
> I have lived by this ever since.

A longer reflection:

> There is a particular joy in finding a bug that has existed for three years, survived two rewrites, and only manifests on the second Tuesday of months with an R in them. You do not fix this bug. You document it. You give it a name. You and the bug have an understanding now.

---

## Tables

### Comparison: Debugging Strategies

| Strategy | Time Cost | Effectiveness | Dignity Preserved |
|---|---|---|---|
| Read the error message | 30 seconds | High | Yes |
| Add print statements everywhere | 10 minutes | Medium | Mostly |
| Rewrite from scratch | 3 hours | Low | No |
| Ask a rubber duck | 5 minutes | Surprisingly high | Depends on witnesses |
| Git blame and confront the author | 15 minutes | Cathartic | Absolutely not |
| Close laptop and go outside | 20 minutes | Sometimes perfect | Yes |

### World's Simplest Status Board

| Service | Status |
|---|---|
| API | Operational |
| Database | Operational |
| Auth | Operational |
| The build | It's complicated |

---

## Code

### JavaScript --- The Basics

```javascript
function greet(name) {
  if (!name) {
    return "Hello, mysterious stranger.";
  }
  return `Hello, ${name}. Welcome to the codebase. I'm sorry.`;
}

const team = ["Alice", "Bob", "Carol"];
team.forEach(person => console.log(greet(person)));
```

### Python --- A Haiku Generator

```python
import random

syllables = {
    5: ["the old pond awaits", "autumn moonlight glows", "silence fills the room"],
    7: ["a frog leaps into water", "leaves fall without a whisper", "the keyboard clicks on and on"],
}

def haiku():
    return "\n".join([
        random.choice(syllables[5]),
        random.choice(syllables[7]),
        random.choice(syllables[5]),
    ])

print(haiku())
```

### Rust --- For When You Want the Compiler to Yell at You

```rust
fn main() {
    let languages: Vec<&str> = vec![
        "JavaScript", "Python", "Rust", "Go", "TypeScript"
    ];

    let verdict: Vec<String> = languages
        .iter()
        .map(|lang| format!("{}: {}", lang, match *lang {
            "Rust" => "the compiler is your therapist",
            "JavaScript" => "undefined is not a function",
            "Python" => "indentation is load-bearing",
            "Go" => "if err != nil { panic }",
            "TypeScript" => "any any any any any",
            _ => "no comment",
        }))
        .collect();

    for v in &verdict {
        println!("{}", v);
    }
}
```

### SQL --- The Query That Answers Everything

```sql
SELECT
    developer.name,
    developer.coffee_consumed_liters,
    project.deadline,
    CASE
        WHEN project.deadline < CURRENT_DATE
        THEN 'too late'
        WHEN project.deadline < CURRENT_DATE + INTERVAL '7 days'
        THEN 'panic mode'
        ELSE 'false sense of security'
    END AS status
FROM developers developer
JOIN projects project ON developer.id = project.lead_id
WHERE developer.is_still_awake = true
ORDER BY developer.coffee_consumed_liters DESC;
```

### Bash --- Deploy Script (Use Responsibly)

```bash
#!/bin/bash
set -euo pipefail

echo "Deploying to production..."
echo "Just kidding. Running tests first."

if ! npm test; then
    echo "Tests failed. Crisis averted."
    exit 1
fi

echo "Tests passed. Deploying for real this time."
git push origin main
echo "Done. Go check the dashboard and try not to refresh it every 3 seconds."
```

### A Diff --- Spot the Bug Fix

```diff
  function calculateTotal(items) {
-   let total = 1;
+   let total = 0;
    for (const item of items) {
      total += item.price * item.quantity;
    }
    return total;
  }
```

---

## Math

For the mathematically inclined, here's some inline math: the quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ and it shows up more often than you'd think.

Display math for when you need dramatic emphasis:

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

Euler's identity, the most beautiful equation in mathematics:

$$
e^{i\pi} + 1 = 0
$$

The probability that your deploy works on Friday afternoon:

$$
P(\text{success}) = \frac{1}{e^{\text{lines changed}}} \approx 0
$$

---

## Links and Images

Links work as expected: visit [Example](https://example.com) or just paste a URL like https://example.com and it auto-links.

---

## Highlights and Comments

This reader supports ==highlighted text== using the `==double equals==` syntax. You can highlight key phrases in any document.

Comments use footnotes[^1] --- they're great for adding context without cluttering the main text. Select any text, click "Comment" in the toolbar, and a footnote is created automatically.

[^1]: Like this! Footnotes are stored as standard markdown, so they're portable and human-readable even in a plain text editor.

You can also combine them: ==highlighted text with a comment==[^2] creates a visible anchor that links to the note below.

[^2]: This is how presenter notes work --- highlight the phrase you want to remember to talk about, then attach your talking point as a comment.

---

## Presentation Mode Tips

This document works as a presentation too! Press **P** or hit the present button to enter presentation mode.

### How Slides Are Generated

Each top-level heading becomes a **title slide**. Each sub-heading becomes a **content slide**. So this document has quite a few slides already.

### Navigation

- Arrow keys and spacebar to move between slides
- Click the left or right edges of the screen
- Use the outline sidebar to jump to any slide
- Press **Escape** to exit back to reader view

### Designing for Both Modes

The best markdown documents work in *both* reader and presentation mode. Keep sections focused, use headings to create natural break points, and remember that a wall of text on a slide is a war crime.

---

## Fin

You've reached the end. You now know everything this reader can do.

Go forth and write beautiful documents. Or at least well-formatted ones. We'll take what we can get.

---

*This guide was written for educational and entertainment purposes. No rubber ducks were harmed in the making of this document.*
