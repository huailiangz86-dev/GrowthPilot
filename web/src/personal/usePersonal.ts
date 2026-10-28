import {useContext} from 'react';
import {PersonalContext} from './context';
export function usePersonal() {const value=useContext(PersonalContext);if(!value)throw new Error('PersonalProvider missing');return value;}
