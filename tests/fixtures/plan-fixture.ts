import type { PlanData } from '../../src/plan-types'

export const fixturePlan: PlanData = {
  meta: {
    subject: 'Python Programming',
    targetCapability: 'Build real-world command-line tools',
    honestTarget: 'Build a working CLI tool and ship it as an installable package',
    hoursPerDay: 2,
    currentLevel: 'Beginner',
    generatedAt: '2026-01-05T09:00:00.000Z',
  },
  scopeNote:
    'This plan focuses on practical CLI tools rather than theoretical computer science concepts.',
  disssPreamble: {
    deconstruction:
      'Python broken into: syntax fundamentals, data structures, control flow, standard library, third-party packages, project structure, testing, packaging, and deployment.',
    selectionRationale:
      'Selected the 20% of Python concepts that carry 80% of practical value: CLI arg parsing, file I/O, virtual environments, and automated testing.',
    cutList:
      'Removed: advanced metaclasses, decorators beyond basic usage, async/await beyond basic patterns, and object-oriented design patterns. These are valuable but not essential for building CLI tools.',
    sequencingRationale:
      'Plan runs backwards from the endgame of shipping an installable CLI tool — every session is justified by what it enables for the artifact that follows. Consolidation slots at positions 6 and 11 double as catch-up when behind and spaced review when on schedule; sessions are otherwise textbook-shaped because each one depends on the last.',
  },
  stakes: 'If I cannot build a working CLI tool by session 14, I will reevaluate my learning approach.',
  phases: [
    {
      title: 'Fundamentals',
      sessions: [1, 2, 3, 4, 5, 6],
      outlierStory: {
        person: 'A self-taught developer documented on BeginnersBook',
        approach: 'Learned Python in days by focusing only on list comprehensions and file I/O',
        principle: 'Focus on the minimum viable syntax to get something working quickly',
        citation: 'https://beginnersbook.com/2017/08/python-tutorial/',
      },
    },
    {
      title: 'Application',
      sessions: [7, 8, 9, 10, 11],
    },
    {
      title: 'Polish & Deploy',
      sessions: [12, 13, 14],
    },
  ],
  sessions: [
    {
      number: 1,
      title: 'Python Syntax Basics',
      artifactOneLiner: 'Write a script that prints command-line arguments',
      materials: [
        {
          title: 'Python Official Tutorial - Chapter 3',
          url: 'https://docs.python.org/3/tutorial/introduction.html',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:10:00.000Z' },
        },
        {
          title: 'Python Official Tutorial - Data Structures',
          url: 'https://docs.python.org/3/tutorial/introduction.html#data-structures',
          sourceType: 'preferred',
          estimatedDuration: 25,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:12:00.000Z' },
        },
      ],
      selfCheck: 'Can I write a script that prints sys.argv values?',
      estimatedTime: 50,
    },
    {
      number: 2,
      title: 'Data Types and Control Flow',
      artifactOneLiner: 'Write a script that filters files by extension',
      materials: [
        {
          title: 'Python Official Docs - Control Flow',
          url: 'https://docs.python.org/3/tutorial/controlflow.html',
          sourceType: 'preferred',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:15:00.000Z' },
        },
        {
          title: 'Real Python - Python Data Types (deep dive)',
          url: 'https://realpython.com/python-data-types/',
          sourceType: 'preferred',
          estimatedDuration: 25,
          paid: true,
          price: 29,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:16:00.000Z' },
        },
      ],
      selfCheck: 'Can I use if/else and loops to filter files by extension?',
      estimatedTime: 60,
    },
    {
      number: 3,
      title: 'Functions and Modules',
      artifactOneLiner: 'Create a reusable function to validate file extensions',
      materials: [
        {
          title: 'Python Modules Documentation',
          url: 'https://docs.python.org/3/tutorial/modules.html',
          sourceType: 'preferred',
          estimatedDuration: 25,
          paid: false,
          verification: { status: 'replaced-after-failure', checkedAt: '2026-01-05T09:20:00.000Z' },
        },
      ],
      selfCheck: 'Can I define and call a function with parameters?',
      estimatedTime: 35,
    },
    {
      number: 4,
      title: 'File I/O',
      artifactOneLiner: 'Read from and write to a text file',
      materials: [
        {
          title: 'Automate the Boring Stuff - Chapter 8',
          url: 'https://automatetheboringstuff.com/2e/chapter8/',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:22:00.000Z' },
        },
      ],
      selfCheck: 'Can I read a file and write its contents to a new file?',
      estimatedTime: 40,
    },
    {
      number: 5,
      title: 'CLI Argument Parsing',
      artifactOneLiner: 'Build a script that accepts --name and --output flags',
      materials: [
        {
          title: 'argparse Documentation',
          url: 'https://docs.python.org/3/library/argparse.html',
          sourceType: 'preferred',
          estimatedDuration: 25,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:25:00.000Z' },
        },
      ],
      selfCheck: 'Can I use argparse to parse --name and --output flags?',
      estimatedTime: 45,
    },
    {
      number: 6,
      title: 'Catch-up and Spaced Review — Fundamentals',
      artifactOneLiner:
        'Catch up on missed fundamentals sessions and re-touch the highest-frequency Python syntax units from sessions 1–5',
      materials: [
        {
          title: 'Python Official Tutorial (full review)',
          url: 'https://docs.python.org/3/tutorial/',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:28:00.000Z' },
        },
      ],
      selfCheck:
        'Have I caught up on missed fundamentals work and re-read the most-used syntax sections from sessions 1–5?',
      estimatedTime: 60,
      consolidation: true,
    },
    {
      number: 7,
      title: 'Unit Testing',
      artifactOneLiner: 'Write pytest tests for the CLI tool',
      materials: [
        {
          title: 'pytest Documentation',
          url: 'https://docs.pytest.org/en/stable/',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:30:00.000Z' },
        },
      ],
      selfCheck: 'Can I write and run a basic pytest test?',
      estimatedTime: 45,
    },
    {
      number: 8,
      title: 'Packaging Basics',
      artifactOneLiner: 'Create a minimal pyproject.toml',
      materials: [
        {
          title: 'Python Packaging Tutorial',
          url: 'https://packaging.python.org/en/latest/tutorials/packaging-projects/',
          sourceType: 'preferred',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:33:00.000Z' },
        },
      ],
      selfCheck: 'Can I create a valid pyproject.toml?',
      estimatedTime: 40,
    },
    {
      number: 9,
      title: 'Building Distributions',
      artifactOneLiner: 'Build and inspect a wheel distribution',
      materials: [
        {
          title: 'build Package on PyPI',
          url: 'https://pypi.org/project/build/',
          sourceType: 'preferred',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'replaced-after-failure', checkedAt: '2026-01-05T09:36:00.000Z' },
        },
      ],
      selfCheck: 'Can I build a wheel with python -m build?',
      estimatedTime: 50,
    },
    {
      number: 10,
      title: 'Virtual Environments',
      artifactOneLiner: 'Create an isolated environment and install the package into it',
      materials: [
        {
          title: 'venv Documentation',
          url: 'https://docs.python.org/3/library/venv.html',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:39:00.000Z' },
        },
      ],
      selfCheck: 'Can I install the package into a fresh venv and import it?',
      estimatedTime: 45,
    },
    {
      number: 11,
      title: 'Catch-up and Spaced Review — Application',
      artifactOneLiner:
        'Catch up on missed application sessions and re-touch the highest-frequency units from sessions 1–10',
      materials: [
        {
          title: 'Python Packaging User Guide (full review)',
          url: 'https://packaging.python.org/en/latest/',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:42:00.000Z' },
        },
      ],
      selfCheck:
        'Have I caught up on missed application work and re-read the most-used application sections from sessions 1–10?',
      estimatedTime: 60,
      consolidation: true,
    },
    {
      number: 12,
      title: 'Advanced Argument Parsing',
      artifactOneLiner: 'Add subcommands for different CLI actions',
      materials: [
        {
          title: 'argparse subcommands guide',
          url: 'https://docs.python.org/3/library/argparse.html#sub-commands',
          sourceType: 'preferred',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'unresolved-after-retries', checkedAt: null },
        },
        {
          title: 'argparse API reference',
          url: 'https://docs.python.org/3/library/argparse.html',
          sourceType: 'preferred',
          estimatedDuration: 20,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:45:00.000Z' },
        },
      ],
      selfCheck: 'Can I invoke two different subcommands from one CLI?',
      estimatedTime: 55,
    },
    {
      number: 13,
      title: 'Error Handling and Logging',
      artifactOneLiner: 'Add graceful error handling and logging to the CLI',
      materials: [
        {
          title: 'logging Documentation',
          url: 'https://docs.python.org/3/library/logging.html',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:48:00.000Z' },
        },
      ],
      selfCheck: 'Does the CLI log errors and exit cleanly on bad input?',
      estimatedTime: 40,
    },
    {
      number: 14,
      title: 'Final Project: Complete CLI Tool',
      artifactOneLiner: 'Build, package and publish a complete CLI tool',
      materials: [
        {
          title: 'Python Packaging User Guide',
          url: 'https://packaging.python.org/en/latest/',
          sourceType: 'preferred',
          estimatedDuration: 90,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-05T09:52:00.000Z' },
        },
      ],
      selfCheck: 'Can I install and run my finished CLI tool from a clean environment?',
      estimatedTime: 120,
    },
  ],
}