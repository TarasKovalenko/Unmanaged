import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const returnOwnedValue: BorrowSnippet = {
  id: 'return-owned-value',
  title: 'Copy out before the owner dies',
  summary: 'Borrow for the parse, then turn the slice into an owned `String` that can outlive the buffer.',
  pairedWith: 'reference-outlives-owner',
  variables: ['request', 'route'],
  code: code`
    fn route_of(request: &str) -> &str {
        request.split(' ').nth(1).unwrap_or("/")
    }

    fn main() {
        let route: String;
        {
            let request = String::from("GET /orders/42");
            route = route_of(&request).to_string();
        }
        println!("routing {route}");
    }
  `,
  spans: [
    { variable: 'request', kind: 'dropped', startLine: 8, endLine: 10, label: 'freed at the closing brace, as before' },
    { variable: 'request', kind: 'borrow', startLine: 9, endLine: 9, label: 'route_of borrows request; to_string() copies the slice before the borrow ends' },
    { variable: 'route', kind: 'dropped', startLine: 9, endLine: 12, label: 'owns its own String; unrelated to request\'s lifetime' },
    { variable: 'route', kind: 'borrow', startLine: 11, endLine: 11, label: 'println! borrows route' },
  ],
  conflicts: [],
  takeaway:
    '`route_of` has an elided lifetime: its returned `&str` borrows from `request`. Written out, it is `fn route_of<\'a>(request: &\'a str) -> &\'a str`. One small allocation on line 9 buys independence. The alternative is to move `request` to the outer scope so the borrow can live longer; pick based on which data should actually be long-lived.',
};
