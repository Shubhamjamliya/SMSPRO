import React, { useState } from 'react';
import { getImageUrl } from '../utils/getImageUrl';

const LazyImage = ({ src, alt = '', className = '', ...rest }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={getImageUrl(src)}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      {...rest}
    />
  );
};

export default LazyImage;
