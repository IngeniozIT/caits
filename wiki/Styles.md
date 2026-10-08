# Styles

A CAITS project writes its styles in SCSS files, apart from the HTML. `init` installs `sass`, and Vite compiles the SCSS. You have nothing to configure.

## Three kinds of stylesheets

| Stylesheet | Where | Who imports it | The pages that load its CSS |
|---|---|---|---|
| The stylesheet of the app | `src/routes/_frontend/style/app.scss` | The layout | All the pages of the layout |
| The stylesheet of a page | Next to the page: `src/routes/_frontend/home-page.scss` | The page (`+page.marko`) | This page only |
| The stylesheet of a component or a View | Next to it: `MessageBoard.scss` | The component, or the View | Each page that shows it |

```marko
// +page.marko
import "./home-page.scss";
```

The build makes one CSS file for the layout, and one for each page: the CSS of its stylesheet, and that of the components and the views that it shows. Each page loads the file of its layout, then its own file. A component that many pages show has its CSS in a file that these pages share.

## The stylesheet of the app

The layout imports `style/app.scss`. This file loads the other files of `style/` with `@use`, and Sass compiles all of them into one CSS.

```
src/routes/_frontend/
  +layout.marko         import "./style/app.scss";
  +page.marko           import "./home-page.scss";
  home-page.scss        @use "values";  then  @media (max-width: values.$narrow) { … }
  style/
    app.scss            @use "theme";  @use "elements";  @use "menu";  …
    _values.scss        the Sass values: $page, $narrow, $phone
    _theme.scss         the colors and the fonts, as CSS variables
    _elements.scss      the HTML elements
    _menu.scss          @use "values";  then  width: values.$page;
```

- A partial is a file whose name starts with `_`. Sass does not compile it alone: its CSS goes into the stylesheet that loads it, at the place of its `@use`.
- The order of the `@use` in `app.scss` is the order of the CSS. Put the general rules first (the theme, the elements), then the parts of the pages.
- A partial loads the partials that it needs. Sass puts the CSS of each file once only in a stylesheet, also when many files of this stylesheet load it.
- `@use` takes the name of the file without `_` and without `.scss`. Use `@use`, not `@import`: Sass will remove `@import`.

## Share values

Each stylesheet of the routes loads the partials of `style/` by their name, from any folder: `@use "values"`. Sass looks for a file next to the stylesheet first, then in `src/routes/_frontend/style/` (`quality/caits/vite.ts` gives this folder to Sass).

Put the Sass values (`$page`, the mixins) in a partial that gives no CSS, as `_values.scss`. A page stylesheet that loads a partial with CSS repeats this CSS in the file of the page.

A context does not import the routes: a View does not load the partials of `style/`. The theme gives its values as CSS variables, and the View reads them with `var()`:

```scss
// style/_theme.scss
:root { --radius: 1rem; }

// MessageBoard.scss
.message-board__message { border-radius: var(--radius); }
```

## What the browser gets

The browser gets CSS only, never SCSS:

- `npm run build`: Sass compiles the SCSS, then Vite minifies the CSS: each CSS file is one line, without the comments. `npm start` sends these files.
- `npm run dev`: Sass compiles the SCSS, but Vite does not minify the CSS: you can read it in the browser. When you save a stylesheet, the page changes, and does not reload.

## The names of the classes

All the classes of the app are global. Thus each class of a page, a component or a View starts with its name (the BEM convention):

```scss
.message-board {          // the block: the View
  &__composer { … }       // .message-board__composer: a part of the View
  &__message { … }
}
```

```marko
<form class="message-board__composer">
```

The classes that all the pages use are in the partials of `style/`: the example has `button`, `eyebrow` and `lead`. The name of a keyframe is global too: `@keyframes message-board-enter`.

A file whose name ends with `.module.scss` also works: `import styles from "./MessageBoard.module.scss"`, then `class=styles.composer`. Its class names are unique to the file. But TypeScript does not check the names in `styles`.

## Fonts

Install the fonts with npm, for example from [Fontsource](https://fontsource.org), and load them in `app.scss`:

```scss
@use "@fontsource-variable/geist";
@use "@fontsource/instrument-serif/400-italic.css" as instrument-serif-italic;
```

Sass gives a module the name of its file. When this name is not a valid name (`400-italic`), give the module another name with `as`. The build puts the files of the fonts in the app: the pages load nothing from another site. Then give the font to the views with a CSS variable (`--font-sans`).

## The architecture rules

The architecture check reads the stylesheets, as it reads the code:

- The routes keep their stylesheets in `src/routes/_frontend/style/`, next to a page or a layout, or next to a component in `component/`. A View keeps its stylesheet in its folder.
- A stylesheet does not go up a folder (`../`): it loads the files of its folder, of the folders below, and of `style/` by their name. The shortcuts (`#context/`, `#frontend/`) do not work in a stylesheet: Sass reads `#` as the start of a fragment of a URL.
- A context does not load a stylesheet of the routes, also by the name of a partial of `style/`.

## Types and tests

`quality/caits/tsconfig.json` includes the types of Vite (`vite/client`): TypeScript accepts `import "./MessageBoard.scss"`.

The unit tests do not compile the styles: a test of a View does not depend on them. The end-to-end tests run on the build, with its CSS.
