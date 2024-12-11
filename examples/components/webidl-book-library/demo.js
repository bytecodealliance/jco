////////////////////////////////
// WebIDL compliant interface //
////////////////////////////////

class Book {
  constructor(title, author, genre, pages) {
    this.title = title;
    this.author = author;
    this.genre = genre || null;
    this.pages = pages || 0;
  }
}

class Library {
  constructor(name) {
    this.libraryName = name;
    this.books = new Map();
  }

  get totalBooks() {
    return this.books.size;
  }

  addBook(book) {
    if (this.books.has(book.title)) {
      return false; // Book already exists
    }
    this.books.set(book.title, book);
    return true;
  }

  removeBook(title) {
    return this.books.delete(title);
  }

  getBookByTitle(title) {
    return this.books.get(title) || null;
  }

  listBooks() {
    return Array.from(this.books.values());
  }

  renameLibrary(newName) {
    this.libraryName = newName;
  }

  asAdvancedLibrary() {
    const al = new AdvancedLibrary();
    al.libraryName = this.libraryName;
    al.books = this.books;
    return al;
  }
}

class AdvancedLibrary extends Library {
  constructor() {
    super();
  }

  asLibrary() {
    return new Library("advanced-library");
  }

  filterBooks(name) {
    return Array.from(this.books.values()).filter((book) => {
      return (
        book.title.toLowerCase().includes(name.toLowerCase()) ||
        book.author.toLowerCase().includes(name.toLowerCase())
      );
    });
  }
}

class BookManager {
  constructor() {
    this._library = null;
  }

  initLibrary(name) {
    const library = new Library(name);
    this._library = library;
  }

  library() {
    if (!this._library) {
      throw new Error("initLibrary must be called first!");
    }
    const library = this._library;
    this._library = null;
    return library;
  }
}

// Wire up the implementations above to globalThis
// which will be used by the component implicitly
//
// While somewhat awkward, current jco bindings
// generate a member/namespace for every dash, so:
//
// "global-book-library" => globalThis.book.library
// "global-console" => globalThis.console
globalThis.book = {
  library: {
    AdvancedLibrary,
    Library,
    BookManager,
  },
};

////////////////////////////////
// Usage of transpiled module //
////////////////////////////////

// NOTE: we use a dynamic import of our transpiled WebAssembly component
// to ensure that globalThis is setup prior to the component logic running
const { librarian } = await import("./dist/transpiled/librarian.js");

let library = librarian.createLocalLibrary();

library = librarian.addFavoriteBook(library);

const [_library, favorites] = librarian.getFavoriteBooks(library);

console.log("Librarian's favorite books:", favorites);
