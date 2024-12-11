// This WebIDL file will be used to automatically generate WIT,
// using the `webidl2wit` tool.
//
// see: https://github.com/MendyBerger/webidl2wit/tree/main

// WebIDL enums are converted as standard WIT enums
enum BookGenre {
  "fiction",
  "non-fiction",
  "mystery",
  "fantasy",
  "science-fiction",
  "biography"
};

// WebIDL typedefs are converted into WIT type aliases
typedef DOMString BookTitle;

// WebIDL dictionaries are turned into WIT structs
dictionary Book {
  required BookTitle title;
  required DOMString author;
  BookGenre genre;
  unsigned short pages;
};

// WebIDL interfaces become WIT resources
interface Library {
  constructor();

  readonly attribute unsigned long totalBooks;

  // Add a Book
  boolean addBook(Book book);

  // Remove a book
  boolean removeBook(DOMString title);

  // Retrieve a book by title (if present)
  Book? getBookByTitle(DOMString title);

  // List all the books
  sequence<Book>? listBooks();
};

interface AdvancedLibrary : Library {
  FrozenArray<Book> filterBooks(DOMString name);
};

partial interface Library {
  readonly attribute LibraryName libraryName;

  // Rename this library
  undefined renameLibrary(LibraryName newName);
};

typedef DOMString LibraryName;

// WebIDL interfaces become WIT resources
interface BookManager {
  constructor();

  readonly attribute Library library;

  // Initialize a library
  undefined initLibrary(LibraryName name);
};
