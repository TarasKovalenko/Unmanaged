import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const errorTypes: Lesson = {
  id: 'or-error-types',
  title: 'Error enums, not exception hierarchies',
  summary: 'A closed enum replaces the base exception class, `From` replaces catch-and-wrap, and `Box<dyn Error>` is the nearest thing to `catch (Exception)`.',
  intro: [
    'A .NET service usually grows a hierarchy: an abstract `PaymentException`, a few sealed subclasses with extra properties, and `InnerException` pointing at whatever the HTTP client threw. Callers pick a level of the hierarchy to catch.',
    'Rust models the same information with an enum per module or per operation. Each variant is a failure case with its own data, `std::error::Error` provides the `Message` and `InnerException` equivalents, and `impl From` does the wrapping that a `catch` block did.',
  ],
  csharp: {
    filename: 'PaymentService.cs',
    code: code`
      public abstract class PaymentException : Exception
      {
          protected PaymentException(string message, Exception? inner = null)
              : base(message, inner) { }
      }

      public sealed class CardDeclinedException(string code)
          : PaymentException($"card declined: {code}")
      {
          public string DeclineCode { get; } = code;
      }

      public sealed class GatewayUnavailableException(GatewayException inner)
          : PaymentException("payment gateway unavailable", inner);

      public sealed class PaymentService(IGateway gateway)
      {
          public string Charge(long cents, string card)
          {
              if (card.EndsWith("0002"))
                  throw new CardDeclinedException("insufficient_funds");
              try
              {
                  return gateway.Charge(cents);
              }
              catch (GatewayException ex)
              {
                  throw new GatewayUnavailableException(ex);
              }
          }
      }
    `,
  },
  rust: {
    filename: 'payment_service.rs',
    stdout: code`
      ok rcpt-1999
      failed: card declined: insufficient_funds
      failed: payment gateway unavailable (caused by: gateway returned 503)
    `,
    code: code`
      use std::error::Error;
      use std::fmt;

      #[derive(Debug)]
      struct GatewayError {
          status: u16,
      }

      impl fmt::Display for GatewayError {
          fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
              write!(f, "gateway returned {}", self.status)
          }
      }

      impl Error for GatewayError {}

      #[derive(Debug)]
      enum PaymentError {
          CardDeclined { code: String },
          GatewayUnavailable(GatewayError),
      }

      impl fmt::Display for PaymentError {
          fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
              match self {
                  PaymentError::CardDeclined { code } => write!(f, "card declined: {code}"),
                  PaymentError::GatewayUnavailable(_) => write!(f, "payment gateway unavailable"),
              }
          }
      }

      impl Error for PaymentError {
          fn source(&self) -> Option<&(dyn Error + 'static)> {
              match self {
                  PaymentError::GatewayUnavailable(inner) => Some(inner),
                  PaymentError::CardDeclined { .. } => None,
              }
          }
      }

      impl From<GatewayError> for PaymentError {
          fn from(e: GatewayError) -> Self {
              PaymentError::GatewayUnavailable(e)
          }
      }

      fn gateway_charge(cents: u64) -> Result<String, GatewayError> {
          if cents > 50_000 { Err(GatewayError { status: 503 }) } else { Ok(format!("rcpt-{cents}")) }
      }

      fn charge(cents: u64, card: &str) -> Result<String, PaymentError> {
          if card.ends_with("0002") {
              return Err(PaymentError::CardDeclined { code: String::from("insufficient_funds") });
          }
          let receipt = gateway_charge(cents)?;
          Ok(receipt)
      }

      fn main() {
          for (cents, card) in [(1_999, "4242424242424242"), (1_999, "4000000000000002"), (90_000, "4242424242424242")] {
              match charge(cents, card) {
                  Ok(receipt) => println!("ok {receipt}"),
                  Err(e) => match e.source() {
                      Some(cause) => println!("failed: {e} (caused by: {cause})"),
                      None => println!("failed: {e}"),
                  },
              }
          }
      }
    `,
  },
  links: [
    {
      csharp: lines(1, 5),
      rust: lines(17, 21),
      note: 'The abstract base class becomes the enum type itself. Catching `PaymentException` corresponds to handling any `PaymentError`; catching a subclass corresponds to matching one variant.',
    },
    {
      csharp: lines(7, 11),
      rust: [19, 26],
      note: 'A subclass with a `DeclineCode` property becomes a variant with a `code` field. The message is not stored: `Display` computes it from the data when someone formats the error.',
    },
    {
      csharp: [13, 14],
      rust: [20, ...lines(32, 38)],
      note: '`InnerException` becomes the `source()` method of `std::error::Error`. The variant owns the inner error, and `source` hands out a reference to it so callers can walk the chain.',
    },
    {
      csharp: lines(22, 29),
      rust: lines(41, 45),
      note: 'Catch-and-wrap becomes `impl From<GatewayError> for PaymentError`. It is written once, and every `?` on a `GatewayError` inside a function returning `PaymentError` uses it.',
    },
    {
      csharp: [20, 21],
      rust: lines(52, 54),
      note: 'Throwing a specific exception becomes returning a specific variant.',
    },
    {
      csharp: [24],
      rust: [55],
      note: 'The `try` block shrinks to one `?`. The conversion from the previous link happens inside it.',
    },
    {
      csharp: [14],
      rust: lines(63, 66),
      note: 'Formatting `e` uses `Display`, which by convention does not repeat the source\'s message. Printing the cause is the caller\'s choice, which is the opposite of `Exception.ToString()` bundling everything.',
    },
  ],
  breaks: [
    {
      heading: 'An enum is closed. There is no "catch the base class" for errors you did not list.',
      body: [
        'An exception hierarchy is open: any assembly can derive from `PaymentException`, and `catch (PaymentException)` catches types that did not exist when it was written. A Rust error enum lists every case, and a `match` over it is checked against that list.',
        'That makes the enum a design decision about **what callers can act on**. Variants the caller will branch on (declined card, retryable outage) deserve their own case. Everything a caller can only log can share one variant holding a boxed source error.',
      ],
    },
    {
      heading: '`Box<dyn Error>` is the `catch (Exception)` type, with the same trade-off',
      body: [
        'Any type implementing `Error` converts into `Box<dyn Error>` through a blanket `From` impl, so a function returning `Result<T, Box<dyn Error>>` can `?` a `ParseIntError`, an `io::Error` and your own error in the same body. That is ideal for `main`, scripts and tests.',
        'The cost is the same as catching `Exception`: callers lose the ability to match. Recovering a concrete type takes `downcast_ref`, which is the Rust spelling of `if (ex is FormatException fe)`, and nobody is warned when the set of possible types changes.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          bad number: invalid digit found in string
          other error: timeout must be at least 1 second
        `,
        code: code`
          use std::error::Error;

          fn timeout_seconds(raw: &str) -> Result<u64, Box<dyn Error>> {
              let secs: u64 = raw.parse()?;
              if secs == 0 {
                  return Err("timeout must be at least 1 second".into());
              }
              Ok(secs)
          }

          fn main() {
              for raw in ["ten", "0"] {
                  let Err(e) = timeout_seconds(raw) else { continue };
                  match e.downcast_ref::<std::num::ParseIntError>() {
                      Some(parse) => println!("bad number: {parse}"),
                      None => println!("other error: {e}"),
                  }
              }
          }
        `,
      },
    },
    {
      heading: 'One `From` per source type, so context has to be added by hand',
      body: [
        'In C# you can catch the same `IOException` in two places and wrap it in two different exceptions. `From<io::Error>` can be implemented only once for a given error enum, so `?` cannot tell "failed reading config" from "failed writing the cache".',
        'When the same source error means different things, skip `From` and convert at the call site with `map_err`. It is also how you attach what the failing operation was doing, which a `Result` does not record the way a stack trace does.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: 'Err(ReadConfig("/etc/shop/missing.toml", NotFound))',
        code: code`
          use std::{fs, io};

          #[derive(Debug)]
          enum StartupError {
              ReadConfig(String, io::ErrorKind),
              WriteCache(String, io::ErrorKind),
          }

          fn start(config: &str, cache: &str) -> Result<(), StartupError> {
              let text = fs::read_to_string(config).map_err(|e| StartupError::ReadConfig(config.to_string(), e.kind()))?;
              fs::write(cache, text).map_err(|e| StartupError::WriteCache(cache.to_string(), e.kind()))?;
              Ok(())
          }

          fn main() {
              println!("{:?}", start("/etc/shop/missing.toml", "/tmp/shop-cache.toml"));
          }
        `,
      },
    },
    {
      heading: '`thiserror` and `anyhow` split the job the way libraries and apps already do',
      body: [
        'Nobody writes `Display`, `source` and `From` by hand for long. The `thiserror` crate derives all three from attributes on the enum: use it in libraries, where callers need to match variants. The `anyhow` crate provides a richer `Box<dyn Error>` with `.context("...")` and backtraces: use it in applications, where errors are mostly reported, not handled.',
        'Neither is magic. The derive below expands to the same impls the lesson wrote out, which is why it helps to have seen them once.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the thiserror and anyhow crates from crates.io.',
        code: code`
          use anyhow::Context;

          #[derive(Debug, thiserror::Error)]
          pub enum PaymentError {
              #[error("card declined: {code}")]
              CardDeclined { code: String },
              #[error("payment gateway unavailable")]
              GatewayUnavailable(#[from] std::io::Error),
          }

          fn main() -> anyhow::Result<()> {
              let config = std::fs::read_to_string("payments.toml").context("reading payments.toml")?;
              println!("{} bytes of config", config.len());
              Err(PaymentError::CardDeclined { code: String::from("insufficient_funds") }.into())
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['or-question-missing-from'],
  takeaways: [
    'Design error enums around what callers will branch on. Everything else can share a variant.',
    '`impl From` is catch-and-wrap written once; `map_err` is catch-and-wrap at one call site.',
    '`Box<dyn Error>` and `anyhow` are for reporting. Enums and `thiserror` are for handling.',
  ],
};
