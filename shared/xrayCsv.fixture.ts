// A made-up Xray "Import steps" CSV, written by hand to the conventions of real Xray DC exports: CRLF between
// records, CRLF or bare LF inside fields, Commons CSV MINIMAL quoting, non-breaking spaces kept. Real exports hold
// company data and stay in the git-ignored private/ folder (see CLAUDE.md).

import type { Step } from './xrayCsv';

export const EXAMPLE_STEPS: Step[] = [
  {
    // Starts with '#', CRLF inside, bold.
    action: '# Open the *Login* page\r\n# Enter valid credentials',
    // A nested list.
    data: "# A user account exists:\r\n#* the 'email' is *set*;\r\n#* the 'password' has *not* expired.",
    expectedResult: "# The 'Home' page is opened.\r\n# The 'Recent notes' section is shown.",
  },
  {
    // Needs no quotes.
    action: "Tap the 'New note' button",
    // A comma.
    data: '1 draft exists, 2 notes are archived',
    // A trailing space.
    expectedResult: 'The editor is opened ',
  },
  {
    // A bare LF inside.
    action: '# Type a title\n# Press Enter',
    // A non-breaking space.
    data: "# The title is 'Groceries list'",
    expectedResult: '# The note is saved {autosave}',
  },
  {
    // Double quotes are doubled.
    action: '# Search for "groceries"',
    // Empty, and not the first field, so unquoted.
    data: '',
    expectedResult: 'Results are shown',
  },
  {
    action: 'Delete the note',
    data: 'MAX_RETRY_COUNT is _not_ reached',
    // A trailing non-breaking space is above 0x20, so it needs no quotes.
    expectedResult: 'Done ',
  },
];

export const EXAMPLE_CSV =
  `Action,Data,Expected Result\r\n` +
  `"# Open the *Login* page\r\n# Enter valid credentials","# A user account exists:\r\n#* the 'email' is *set*;\r\n#* the 'password' has *not* expired.","# The 'Home' page is opened.\r\n# The 'Recent notes' section is shown."\r\n` +
  `Tap the 'New note' button,"1 draft exists, 2 notes are archived","The editor is opened "\r\n` +
  `"# Type a title\n# Press Enter","# The title is 'Groceries list'","# The note is saved {autosave}"\r\n` +
  `"# Search for ""groceries""",,Results are shown\r\n` +
  `Delete the note,MAX_RETRY_COUNT is _not_ reached,Done \r\n`;
