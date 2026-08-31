# Home Testimonials Swiper Parity Design

## Goal

Replace Mandoob's custom testimonial carousel with the same carousel implementation and behavior used by Weelp's `TestimonialSlider` while retaining Mandoob's approved card appearance, colors, font, copy, and 10 testimonials.

## Reference implementation

The Weelp reference uses `swiper` 12.1.2 with `Swiper`, `SwiperSlide`, and the `Autoplay` module. Its testimonial configuration is:

- continuous autoplay with `delay: 0` and `speed: 8000`;
- autoplay stops after user interaction and pauses on hover;
- looping when more than four testimonials exist;
- 1 slide from 450px, 2 from 640px, 3 from 768px, and 4 from 1024px;
- gaps of 10px, 15px, 15px, and 20px at those breakpoints;
- touch and drag behavior supplied by Swiper;
- no previous or next buttons;
- autoplay disabled and transition speed set to zero when reduced motion is requested.

## Mandoob integration

- Add the same Swiper version to Mandoob's dependencies.
- Keep `TestimonialsSection` as the translation-loading server component.
- Replace the custom transform, cloning, pointer, keyboard, and arrow implementation inside `TestimonialsCarousel` with the Weelp Swiper configuration.
- Keep all 10 English and Arabic testimonial records and preserve RTL card content.
- Import only the base Swiper CSS needed by this carousel and scope Mandoob overrides under `.site-public`.
- Preserve equal-height cards and the existing Mandoob card styling.

## Verification

- Add a failing contract test for Swiper imports, Autoplay configuration, exact responsive breakpoints, looping, and removal of custom arrows.
- Verify focused tests, localization parity, TypeScript, lint, formatting, and production build.
- Confirm continuous movement, hover pause, touch dragging, responsive slide counts, reduced-motion behavior, RTL content, and no page overflow on port 3001.
