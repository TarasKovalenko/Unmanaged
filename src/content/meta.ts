/** The toolchain the content was last verified against by `npm run check:content`.
 *  The checker fails if your local rustc reports a different version, so update
 *  this after re-verifying with a newer compiler. */
export const toolchain = {
  rustc: '1.97.1',
  edition: '2024',
};
