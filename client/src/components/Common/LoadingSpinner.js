import React from 'react';
import { CircularProgress, Box } from '@mui/material';

const LoadingSpinner = ({ size = 24, color = 'primary', message = null }) => {
  return (
    <Box 
      display="flex" 
      flexDirection="column"
      alignItems="center" 
      justifyContent="center"
      gap={2}
    >
      <CircularProgress size={size} color={color} />
      {message && (
        <Box color="text.secondary" fontSize="0.875rem">
          {message}
        </Box>
      )}
    </Box>
  );
};

export default LoadingSpinner;