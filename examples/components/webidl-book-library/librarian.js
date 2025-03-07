import { BookManager } from "webidl:pkg/global-book-library";

export const librarian = {
  createLocalLibrary() {
    let bm = new BookManager();
    bm.initLibrary("great-library-of-wasmxandria");
    return bm.library();
  },

  addFavoriteBook(library) {
    if (!library) {
      throw new Error("missing/invalid library");
    }
    library.addBook({
      title: "The Library Book",
      author: "Susan Orlean",
      genre: BookManager.NonFiction,
      pages: 317,
    });
    return library;
  },

  getFavoriteBooks(library) {
    if (!library) {
      throw new Error("missing/invalid library");
    }
    let advanced = library.asAdvancedLibrary();
    let favorites = advanced.filterBooks("library");
    return [library, favorites];
  },
};
