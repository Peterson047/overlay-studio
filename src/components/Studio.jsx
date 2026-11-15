import OverlayLayout from './OverlayLayout';
import { OBSProvider } from '../context/OBSContext';

export default function Studio() {
    return <OBSProvider><OverlayLayout /></OBSProvider>;
}
